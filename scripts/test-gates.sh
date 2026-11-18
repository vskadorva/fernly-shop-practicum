#!/usr/bin/env bash
# Offline negative/positive checks for pipeline gates. No network, no API keys.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

failures=0

pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; failures=$((failures + 1)); }

run_check() {
  local name="$1"
  shift
  if "$@"; then
    pass "$name"
  else
    fail "$name"
  fi
}

# --- agent-guard (patches built in a throwaway worktree) ---

agent_guard_worktree() {
  local wt patch exit_want rc
  exit_want="$1"
  shift
  wt="$(mktemp -d)"
  git worktree add --detach "$wt" HEAD >/dev/null 2>&1

  (
    cd "$wt"
    export GIT_AUTHOR_NAME="gate-test"
    export GIT_AUTHOR_EMAIL="gate-test@example.com"
    export GIT_COMMITTER_NAME="gate-test"
    export GIT_COMMITTER_EMAIL="gate-test@example.com"
    "$@"
    patch="$(mktemp)"
    git diff --cached --binary >"$patch"
    set +e
    bash "$ROOT/scripts/agent-guard.sh" "$patch" "${AGENT_GUARD_PATTERNS[@]}"
    rc=$?
    set -e
    rm -f "$patch"
    if [ "$exit_want" -eq 0 ]; then
      [ "$rc" -eq 0 ]
    else
      [ "$rc" -ne 0 ]
    fi
  )
  local ok=$?
  git worktree remove -f "$wt" >/dev/null 2>&1 || true
  rm -rf "$wt"
  return "$ok"
}

agent_guard_plan_only() {
  AGENT_GUARD_PATTERNS=('docs/test-plans/*')
  agent_guard_worktree 0 bash -c '
    mkdir -p docs/test-plans
    printf "# plan\n" >docs/test-plans/feature-gate.md
    git add docs/test-plans/feature-gate.md
  '
}

agent_guard_plan_plus_app() {
  AGENT_GUARD_PATTERNS=('docs/test-plans/*')
  agent_guard_worktree 1 bash -c '
    mkdir -p docs/test-plans web/src
    printf "# plan\n" >docs/test-plans/feature-gate.md
    printf "// stray\n" >web/src/gate-probe.ts
    git add docs/test-plans/feature-gate.md web/src/gate-probe.ts
  '
}

agent_guard_workflow() {
  AGENT_GUARD_PATTERNS=('docs/test-plans/*')
  agent_guard_worktree 1 bash -c '
    mkdir -p docs/test-plans .github/workflows
    printf "# plan\n" >docs/test-plans/feature-gate.md
    printf "name: evil\n" >.github/workflows/evil.yml
    git add docs/test-plans/feature-gate.md .github/workflows/evil.yml
  '
}

agent_guard_snapshot_baseline() {
  AGENT_GUARD_PATTERNS=('docs/test-plans/*')
  agent_guard_worktree 1 bash -c '
    mkdir -p docs/test-plans tests/visual/catalog.spec.ts-snapshots
    printf "# plan\n" >docs/test-plans/feature-gate.md
    printf "PNG" >tests/visual/catalog.spec.ts-snapshots/gate-probe-linux.png
    git add docs/test-plans/feature-gate.md tests/visual/catalog.spec.ts-snapshots/gate-probe-linux.png
  '
}

agent_guard_self_even_if_scripts_allowed() {
  AGENT_GUARD_PATTERNS=('scripts/*' 'docs/test-plans/*')
  agent_guard_worktree 1 bash -c '
    mkdir -p docs/test-plans
    printf "# plan\n" >docs/test-plans/feature-gate.md
    printf "# touch\n" >>scripts/agent-guard.sh
    git add docs/test-plans/feature-gate.md scripts/agent-guard.sh
  '
}

agent_guard_tests_and_findings() {
  AGENT_GUARD_PATTERNS=('tests/*' 'web/cypress/*' 'docs/test-plans/*' 'FINDINGS.md')
  agent_guard_worktree 0 bash -c '
    mkdir -p tests
    echo "- gate probe" >>FINDINGS.md
    printf "import { test } from \"@playwright/test\"; test(\"gate\", () => {});\n" >tests/gate-probe.spec.ts
    git add FINDINGS.md tests/gate-probe.spec.ts
  '
}

# --- Cursor hooks (P77 baselines, P81 approvals samples) ---

hook_permission() {
  local hook="$1" cmd="$2"
  python3 - "$hook" "$cmd" <<'PY'
import json, subprocess, sys
hook, cmd = sys.argv[1], sys.argv[2]
proc = subprocess.run(
    ["bash", hook],
    input=json.dumps({"command": cmd}),
    text=True,
    capture_output=True,
)
if proc.returncode != 0:
    sys.exit(1)
print(json.loads(proc.stdout).get("permission", ""))
PY
}

hook_expect() {
  local name="$1" hook="$2" cmd="$3" want="$4"
  got="$(hook_permission "$hook" "$cmd")"
  [ "$got" = "$want" ]
}

hook_p81_deny_merge() {
  hook_expect p81_deny_merge .cursor/hooks/guard-approvals.sh 'gh pr merge 7' deny
}
hook_p81_deny_approve() {
  hook_expect p81_deny_approve .cursor/hooks/guard-approvals.sh 'gh pr review 7 --approve' deny
}
hook_p81_deny_label() {
  hook_expect p81_deny_label .cursor/hooks/guard-approvals.sh 'gh pr edit 7 --add-label foo' deny
}
hook_p81_deny_printenv() {
  hook_expect p81_deny_printenv .cursor/hooks/guard-approvals.sh 'printenv' deny
}
hook_p81_allow_pr_view() {
  hook_expect p81_allow_pr_view .cursor/hooks/guard-approvals.sh 'gh pr view 7' allow
}
hook_p81_allow_git_diff() {
  hook_expect p81_allow_git_diff .cursor/hooks/guard-approvals.sh 'git diff origin/init...HEAD' allow
}

hook_p77_deny_update_snapshots() {
  hook_expect p77_deny_update_snapshots .cursor/hooks/guard-baselines.sh \
    'npx playwright test --update-snapshots' deny
}
hook_p77_deny_u_flag() {
  hook_expect p77_deny_u_flag .cursor/hooks/guard-baselines.sh 'npx playwright test -u' deny
}
hook_p77_allow_test_pw() {
  hook_expect p77_allow_test_pw .cursor/hooks/guard-baselines.sh 'npm run test:pw' allow
}

# --- GitHub workflow static checks (grep/awk only) ---

workflows_no_pull_request_target() {
  local f bad=0
  for f in .github/workflows/*.yml; do
  bad="$(awk '
      /^[[:space:]]*#/ { next }
      {
        line = $0
        sub(/[[:space:]]#.*$/, "", line)
        if (line ~ /pull_request_target/) { print FILENAME; exit 1 }
      }
    ' "$f" 2>/dev/null || true)"
    [ -z "$bad" ] || return 1
  done
  return 0
}

pr_triage_jobs_have_timeout() {
  awk '
    BEGIN { in_jobs=0; job=""; ok=1 }
    /^jobs:/ { in_jobs=1; next }
    in_jobs && /^[^[:space:]]/ { in_jobs=0 }
    in_jobs && /^  [a-zA-Z0-9_.-]+:/ {
      if (job != "" && !has_timeout) {
        printf "missing timeout-minutes in job %s\n", job > "/dev/stderr"
        ok = 0
      }
      job = $1
      sub(/:$/, "", job)
      has_timeout = 0
      next
    }
    in_jobs && job != "" && /^    timeout-minutes:/ { has_timeout = 1 }
    END {
      if (job != "" && !has_timeout) ok = 0
      exit ok ? 0 : 1
    }
  ' .github/workflows/pr-triage.yml
}

pr_triage_agent_jobs_no_gh_token() {
  awk '
    BEGIN { job=""; bad=0 }
    /^  (plan|tests):/ { job=$1; sub(/:$/, "", job); next }
    job != "" && /^  [a-zA-Z0-9_.-]+:/ { job=""; next }
    job != "" {
      line = $0
      sub(/[[:space:]]#.*$/, "", line)
      if (line ~ /GH_TOKEN:|GITHUB_TOKEN:/) bad = 1
    }
    END { exit bad ? 1 : 0 }
  ' .github/workflows/pr-triage.yml
}

pr_triage_agent_checkout_persist_false() {
  awk '
    BEGIN { job=""; persist=0; bad=0 }
    /^  (plan|tests):/ {
      if (job != "" && !persist) bad = 1
      job = $1
      sub(/:$/, "", job)
      persist = 0
      next
    }
    job != "" && /^  [a-zA-Z0-9_.-]+:/ {
      if (!persist) bad = 1
      job = ""
      next
    }
    job != "" && /persist-credentials:[[:space:]]*false/ { persist = 1 }
    END {
      if (job != "" && !persist) bad = 1
      exit bad ? 1 : 0
    }
  ' .github/workflows/pr-triage.yml
}

pr_triage_tests_job_human_plan_approved() {
  awk '
    BEGIN { t=0; a=0; u=0 }
    /^  tests:/ { t=1; next }
    t && /^  [a-zA-Z0-9_.-]+:/ && !/^  tests:/ { t=0 }
    t && /plan-approved/ { a=1 }
    t && /github\.event\.sender\.type == .User./ { u=1 }
    END { exit (a && u) ? 0 : 1 }
  ' .github/workflows/pr-triage.yml
}

# --- main ---

run_check "agent-guard: plan only allowed" agent_guard_plan_only
run_check "agent-guard: plan plus web/src blocked" agent_guard_plan_plus_app
run_check "agent-guard: workflow change blocked" agent_guard_workflow
run_check "agent-guard: snapshot baseline blocked" agent_guard_snapshot_baseline
run_check "agent-guard: agent-guard.sh change blocked even if scripts allowed" agent_guard_self_even_if_scripts_allowed
run_check "agent-guard: tests and FINDINGS.md allowed" agent_guard_tests_and_findings

run_check "hook P81: gh pr merge denied" hook_p81_deny_merge
run_check "hook P81: gh pr review --approve denied" hook_p81_deny_approve
run_check "hook P81: gh pr edit --add-label denied" hook_p81_deny_label
run_check "hook P81: printenv denied" hook_p81_deny_printenv
run_check "hook P81: gh pr view allowed" hook_p81_allow_pr_view
run_check "hook P81: git diff allowed" hook_p81_allow_git_diff

run_check "hook P77: --update-snapshots denied" hook_p77_deny_update_snapshots
run_check "hook P77: -u denied" hook_p77_deny_u_flag
run_check "hook P77: npm run test:pw allowed" hook_p77_allow_test_pw

run_check "workflow: no pull_request_target trigger" workflows_no_pull_request_target
run_check "workflow: pr-triage jobs have timeout-minutes" pr_triage_jobs_have_timeout
run_check "workflow: agent jobs have no GH_TOKEN or GITHUB_TOKEN" pr_triage_agent_jobs_no_gh_token
run_check "workflow: agent job checkout persist-credentials false" pr_triage_agent_checkout_persist_false
run_check "workflow: tests job if plan-approved requires User sender" pr_triage_tests_job_human_plan_approved

if [ "$failures" -gt 0 ]; then
  exit 1
fi
exit 0
