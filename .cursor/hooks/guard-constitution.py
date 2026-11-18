#!/usr/bin/env python3
"""Block agent edits that introduce Playwright/Cypress constitution violations."""

from __future__ import annotations

import json
import re
import sys
from collections.abc import Callable
from pathlib import Path

GUARDED_FILE = re.compile(
    r"((tests|pages)/.+\.[jt]sx?|web/cypress/.+\.cy\.(ts|tsx))$",
)
SPEC_FILE = re.compile(
    r"(tests/.+\.(spec|test)\.[jt]sx?|web/cypress/.+\.cy\.(ts|tsx))$",
)

XPATH_LOCATOR = re.compile(r"""locator\s*\(\s*['"`]//""")
ANY_TYPE = re.compile(
    r":\s*any\b|as\s+any\b|<any>|Array<any>",
)
EMAIL_FILL = re.compile(r"""\.fill\s*\(\s*['"][^'"]*@[^'"]*['"]\s*\)""")
CRED_ASSIGN = re.compile(
    r"""(?i)(password|secret|api_key|token)\s*[:=]\s*['"][^'"]{4,}['"]""",
)
DESCRIBE_TAG = re.compile(
    r"test\.describe\s*\([\s\S]*?,\s*\{[\s\S]*?\btag\s*:",
)
CY_WAIT_MS = re.compile(r"cy\.wait\s*\(\s*\d+")


def active_text(content: str) -> str:
    lines: list[str] = []
    for line in content.splitlines():
        stripped = line.lstrip()
        if stripped.startswith("//") or stripped.startswith("*"):
            continue
        lines.append(line.split("//", 1)[0])
    return "\n".join(lines)


def count_active_assertions(content: str) -> int:
    total = 0
    for line in active_text(content).splitlines():
        total += line.count("expect(")
        total += line.count(".should(")
    return total


def count_wait_for_timeout(content: str) -> int:
    return active_text(content).count(".waitForTimeout(")


def count_cy_wait_ms(content: str) -> int:
    return len(CY_WAIT_MS.findall(active_text(content)))


def count_pattern(content: str, pattern: re.Pattern[str]) -> int:
    return len(pattern.findall(active_text(content)))


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


def check_increase(
    label: str,
    before: str,
    after: str,
    counter: Callable[[str], int],
) -> str | None:
    before_n = counter(before)
    after_n = counter(after)
    if after_n > before_n:
        return f"{label} introduced ({before_n} -> {after_n})"
    return None


def check_delta_increase(
    label: str,
    old_s: str,
    new_s: str,
    counter: Callable[[str], int],
) -> str | None:
    if counter(new_s) > counter(old_s):
        return f"{label} introduced in edit"
    return None


def collect_file_violations(before: str, after: str, *, is_spec: bool) -> list[str]:
    reasons: list[str] = []

    checks: list[tuple[str, Callable[[str], int]]] = [
        (".waitForTimeout(", count_wait_for_timeout),
        ("cy.wait(<milliseconds>)", count_cy_wait_ms),
        ("XPath locator (locator('//…'))", lambda s: count_pattern(s, XPATH_LOCATOR)),
        ("TypeScript any", lambda s: count_pattern(s, ANY_TYPE)),
        ("Hardcoded email in .fill()", lambda s: count_pattern(s, EMAIL_FILL)),
        (
            "Hardcoded password/secret/api_key/token",
            lambda s: count_pattern(s, CRED_ASSIGN),
        ),
        ("tag on test.describe()", lambda s: count_pattern(s, DESCRIBE_TAG)),
    ]

    for label, counter in checks:
        reason = check_increase(label, before, after, counter)
        if reason:
            reasons.append(reason)

    if is_spec:
        before_e = count_active_assertions(before)
        after_e = count_active_assertions(after)
        if before_e > after_e:
            reasons.append(
                f"active expect( / .should( count dropped ({before_e} -> {after_e})"
            )

    return reasons


def collect_delta_violations(old_s: str, new_s: str, *, is_spec: bool) -> list[str]:
    reasons: list[str] = []

    checks: list[tuple[str, Callable[[str], int]]] = [
        (".waitForTimeout(", count_wait_for_timeout),
        ("cy.wait(<milliseconds>)", count_cy_wait_ms),
        ("XPath locator (locator('//…'))", lambda s: count_pattern(s, XPATH_LOCATOR)),
        ("TypeScript any", lambda s: count_pattern(s, ANY_TYPE)),
        ("Hardcoded email in .fill()", lambda s: count_pattern(s, EMAIL_FILL)),
        (
            "Hardcoded password/secret/api_key/token",
            lambda s: count_pattern(s, CRED_ASSIGN),
        ),
        ("tag on test.describe()", lambda s: count_pattern(s, DESCRIBE_TAG)),
    ]

    for label, counter in checks:
        reason = check_delta_increase(label, old_s, new_s, counter)
        if reason:
            reasons.append(reason)

    if is_spec:
        if count_active_assertions(new_s) < count_active_assertions(old_s):
            reasons.append("active expect( / .should( removed or commented in edit")

    return reasons


def block(file_path: str, reasons: list[str]) -> None:
    detail = "; ".join(reasons)
    message = f"Blocked: constitution violation in {file_path} — {detail}"
    print(json.dumps({"user_message": message, "agent_message": message}))
    print(message, file=sys.stderr)
    sys.exit(2)


def main() -> None:
    raw = sys.stdin.read()
    if not raw.strip():
        print("guard-constitution: empty stdin", file=sys.stderr)
        sys.exit(1)

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"guard-constitution: invalid JSON — {exc}", file=sys.stderr)
        sys.exit(1)

    file_path = payload.get("file_path") or ""
    normalized = file_path.replace("\\", "/")
    if not GUARDED_FILE.search(normalized):
        sys.exit(0)

    edits = payload.get("edits")
    if edits is None:
        edits = []
    if not isinstance(edits, list):
        print("guard-constitution: edits must be a list", file=sys.stderr)
        sys.exit(1)

    path = Path(file_path)
    if not path.is_file():
        print(f"guard-constitution: file not found — {file_path}", file=sys.stderr)
        sys.exit(1)

    after_content = path.read_text(encoding="utf-8")
    is_spec = bool(SPEC_FILE.search(normalized))
    before_content = reconstruct_before(after_content, edits)

    reasons: list[str] = []
    if before_content is not None:
        reasons = collect_file_violations(before_content, after_content, is_spec=is_spec)
    else:
        for edit in edits:
            old_s = edit.get("old_string") or ""
            new_s = edit.get("new_string") or ""
            reasons.extend(
                collect_delta_violations(old_s, new_s, is_spec=is_spec),
            )
        if is_spec and not any("expect(" in r or ".should(" in r for r in reasons):
            after_count = count_active_assertions(after_content)
            delta = sum(
                count_active_assertions(edit.get("old_string") or "")
                - count_active_assertions(edit.get("new_string") or "")
                for edit in edits
            )
            before_count = after_count + delta
            if before_count > after_count:
                reasons.append(
                    f"active expect( / .should( count dropped ({before_count} -> {after_count})"
                )

    if reasons:
        block(file_path, reasons)

    print(f"guard-constitution: OK — {file_path}", file=sys.stderr)
    sys.exit(0)


if __name__ == "__main__":
    main()
