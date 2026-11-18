#!/usr/bin/env python3
"""Block agent edits that reduce active expect( or .should( calls in test files."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

TEST_FILE = re.compile(
    r"(tests/.+\.(spec|test)\.[jt]sx?|web/cypress/.+\.cy\.(ts|tsx))$",
)


def count_active_assertions(content: str) -> int:
    total = 0
    for line in content.splitlines():
        stripped = line.lstrip()
        if stripped.startswith("//") or stripped.startswith("*"):
            continue
        active = line.split("//", 1)[0]
        total += active.count("expect(")
        total += active.count(".should(")
    return total


def reconstruct_before(after_content: str, edits: list[dict]) -> str | None:
    content = after_content
    for edit in reversed(edits):
        new_string = edit.get("new_string")
        old_string = edit.get("old_string")
        if new_string is None or old_string is None:
            return None
        if new_string not in content:
            return None
        content = content.replace(new_string, old_string, 1)
    return content


def fallback_before_count(after_count: int, edits: list[dict]) -> int:
    delta = 0
    for edit in edits:
        old_s = edit.get("old_string") or ""
        new_s = edit.get("new_string") or ""
        delta += count_active_assertions(old_s) - count_active_assertions(new_s)
    return after_count + delta


def main() -> None:
    raw = sys.stdin.read()
    if not raw.strip():
        print("guard-test-assertions: empty stdin", file=sys.stderr)
        sys.exit(1)

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"guard-test-assertions: invalid JSON — {exc}", file=sys.stderr)
        sys.exit(1)

    file_path = payload.get("file_path") or ""
    normalized = file_path.replace("\\", "/")
    if not TEST_FILE.search(normalized):
        sys.exit(0)

    edits = payload.get("edits")
    if edits is None:
        edits = []
    if not isinstance(edits, list):
        print("guard-test-assertions: edits must be a list", file=sys.stderr)
        sys.exit(1)

    path = Path(file_path)
    if not path.is_file():
        print(f"guard-test-assertions: file not found — {file_path}", file=sys.stderr)
        sys.exit(1)

    after_content = path.read_text(encoding="utf-8")
    after_count = count_active_assertions(after_content)

    before_content = reconstruct_before(after_content, edits)
    if before_content is not None:
        before_count = count_active_assertions(before_content)
    else:
        before_count = fallback_before_count(after_count, edits)

    if before_count > after_count:
        message = (
            f"Blocked: test assertions weakened in {file_path} — active expect( / "
            f".should( count {before_count} -> {after_count}. Do not delete or comment "
            "out assertions to make tests pass. Fix the app, locator, or test data instead."
        )
        out = {"user_message": message, "agent_message": message}
        print(json.dumps(out))
        print(message, file=sys.stderr)
        sys.exit(2)

    print(
        f"guard-test-assertions: OK — {after_count} active assertion(s) preserved",
        file=sys.stderr,
    )
    sys.exit(0)


if __name__ == "__main__":
    main()
