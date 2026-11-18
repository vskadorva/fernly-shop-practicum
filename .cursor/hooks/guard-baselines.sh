#!/usr/bin/env bash
set -euo pipefail

input=$(cat)

python3 - "$input" <<'PY'
import json
import re
import sys

payload = json.loads(sys.argv[1])
command = payload.get("command") or ""

allow = {"permission": "allow"}

def deny() -> None:
    user_message = (
        "Playwright snapshot updates are not allowed from the agent shell. "
        "Baseline images are refreshed only via the “Visual baselines” GitHub Actions "
        "workflow on Linux, then merged through a reviewed pull request."
    )
    agent_message = (
        "Do not run --update-snapshots or -u locally. Use workflow "
        ".github/workflows/visual-baselines.yml (workflow_dispatch) and open a PR "
        "from the visual-baselines/<run id> branch."
    )
    print(
        json.dumps(
            {
                "permission": "deny",
                "user_message": user_message,
                "agent_message": agent_message,
            }
        )
    )

if "playwright" not in command:
    print(json.dumps(allow))
    sys.exit(0)

if "--update-snapshots" in command:
    deny()
    sys.exit(0)

if re.search(r"(?:^|\s)-u(?:\s|$|=)", command):
    deny()
    sys.exit(0)

print(json.dumps(allow))
PY
