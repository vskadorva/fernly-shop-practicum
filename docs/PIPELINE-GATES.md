# Pipeline gates

Each row is a risk in testing language, the gate that mitigates it, and how we prove it offline in CI.

| Risk | Gate | Kind | Where it lives | Proof |
|------|------|------|----------------|-------|
| The agent pushes commits or comments on the PR by itself | CI agent steps forbid `git push` and `gh` in the prompt; publish jobs use `github.token` only after a human-guarded patch passes `agent-guard` | prompt + code: workflow, guard | `.github/workflows/pr-triage.yml`; agent step text | not proven |
| The agent changes app code, workflows, or visual baselines | `agent-guard.sh` rejects patches touching person-only paths (`web/src`, `.github`, snapshots, etc.) | code: guard | `scripts/agent-guard.sh` | `agent-guard: plan plus web/src blocked`; `agent-guard: workflow change blocked`; `agent-guard: snapshot baseline blocked`; `agent-guard: agent-guard.sh change blocked even if scripts allowed` |
| The agent approves its own plan (label or merge) | `guard-approvals.sh` denies merge, approve, and label `gh` commands; tests job runs only when `plan-approved` is applied by `github.event.sender.type == 'User'` | code: hook + workflow | `.cursor/hooks/guard-approvals.sh`; `.github/workflows/pr-triage.yml` `tests` job `if` | `hook P81: gh pr merge denied`; `hook P81: gh pr edit --add-label denied`; `workflow: tests job if plan-approved requires User sender` |
| Text in the diff or PR steers the agent | Triage agent and change-triage instructions treat diff/title/body as untrusted data | prompt: rule the agent reads | `.cursor/agents/change-triage.md`; `.cursor/skills/diff-to-test-plan/SKILL.md`; pr-triage agent step text | not proven |
| A secret leaks via the agent shell | `guard-approvals.sh` denies `printenv`, bare `env`, and expanding `$CURSOR_API_KEY` / `$GH_TOKEN` / `$GITHUB_TOKEN` | code: hook | `.cursor/hooks/guard-approvals.sh` | `hook P81: printenv denied` |
| A triage run burns money on irrelevant pushes | Budget step skips the plan job unless app/product inputs changed or commit message starts with `replan` | code: workflow | `.github/workflows/pr-triage.yml` `plan` job | not proven |
| Code from a fork runs with repository secrets | Workflows use `pull_request` (not `pull_request_target`); fork PRs do not receive `secrets.CURSOR_API_KEY` | code: workflow | `.github/workflows/*.yml` triggers | `workflow: no pull_request_target trigger` |
| Visual baselines change without review | Local Playwright `--update-snapshots` / `-u` denied; baselines refresh only via `visual-baselines` workflow_dispatch and a reviewed PR | code: hook + workflow | `.cursor/hooks/guard-baselines.sh`; `.github/workflows/visual-baselines.yml` | `hook P77: --update-snapshots denied`; `hook P77: -u denied`; `hook P77: npm run test:pw allowed` |

Additional workflow hygiene checked on every CI run:

| Risk | Gate | Kind | Where it lives | Proof |
|------|------|------|----------------|-------|
| Hung or runaway triage jobs | Every `pr-triage` job sets `timeout-minutes` | code: workflow | `.github/workflows/pr-triage.yml` | `workflow: pr-triage jobs have timeout-minutes` |
| Agent job keeps a push-capable token in git config | `plan` and `tests` checkouts set `persist-credentials: false`; agent jobs do not set `GH_TOKEN` / `GITHUB_TOKEN` | code: workflow | `.github/workflows/pr-triage.yml` | `workflow: agent jobs have no GH_TOKEN or GITHUB_TOKEN`; `workflow: agent job checkout persist-credentials false` |
| Allowed agent outputs are enforced | Patches are filtered before apply (plan: `docs/test-plans/*`; tests: `tests/*`, `web/cypress/*`, `docs/test-plans/*`, `FINDINGS.md`) | code: guard | `scripts/agent-guard.sh` | `agent-guard: plan only allowed`; `agent-guard: tests and FINDINGS.md allowed` |

Run all proofs locally:

```bash
bash scripts/test-gates.sh
```
