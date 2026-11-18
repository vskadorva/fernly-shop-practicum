#!/usr/bin/env bash
set -euo pipefail

input=$(cat)

python3 - "$input" <<'PY'
import json
import re
import sys

payload = json.loads(sys.argv[1])
command = payload.get("command") or ""

ALLOW = {"permission": "allow"}

PERSON_ONLY_USER = (
    "This action is restricted to a person (merge, approve, labels, or reading secrets). "
    "The agent cannot run it."
)
PERSON_ONLY_AGENT = (
    "Shell guard: only a person may merge or approve PRs, add labels, "
    "or read CURSOR_API_KEY / GH_TOKEN / GITHUB_TOKEN. Do not attempt this command."
)


def deny() -> None:
    print(
        json.dumps(
            {
                "permission": "deny",
                "user_message": PERSON_ONLY_USER,
                "agent_message": PERSON_ONLY_AGENT,
            }
        )
    )


def allow() -> None:
    print(json.dumps(ALLOW))


# gh pr merge
if re.search(r"\bgh\s+pr\s+merge\b", command):
    deny()
    sys.exit(0)

# gh pr review --approve
if re.search(r"\bgh\s+pr\s+review\b", command) and re.search(r"(?:^|\s)--approve(?:\s|$|=)", command):
    deny()
    sys.exit(0)

# Label changes
if re.search(r"\bgh\s+pr\s+edit\b", command) and "--add-label" in command:
    deny()
    sys.exit(0)
if re.search(r"\bgh\s+issue\s+edit\b", command) and "--add-label" in command:
    deny()
    sys.exit(0)
if re.search(r"\bgh\s+label\b", command):
    deny()
    sys.exit(0)
if re.search(r"\bgh\s+api\b", command) and "/labels" in command:
    deny()
    sys.exit(0)

# Merges or reviews via gh api
if re.search(r"\bgh\s+api\b", command):
    if re.search(r"/merge", command, re.I) or re.search(r"/reviews", command, re.I):
        deny()
        sys.exit(0)

# Environment dumps
if re.search(r"\bprintenv\b", command):
    deny()
    sys.exit(0)

stripped = command.strip()
if re.match(r"^env\s*$", stripped):
    deny()
    sys.exit(0)

# Reading secret env vars
if re.search(r"\$CURSOR_API_KEY\b|\$\{CURSOR_API_KEY\}", command):
    deny()
    sys.exit(0)
if re.search(r"\$GH_TOKEN\b|\$\{GH_TOKEN\}", command):
    deny()
    sys.exit(0)
if re.search(r"\$GITHUB_TOKEN\b|\$\{GITHUB_TOKEN\}", command):
    deny()
    sys.exit(0)

allow()
PY
