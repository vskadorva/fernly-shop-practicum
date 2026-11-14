# QA pipeline metrics

Repo: `vskadorva/fernly-shop-practicum`. Generated 2026-11-07T02:21:26Z by `node scripts/qa-metrics.mjs` (read-only; uses `gh` only).

**Totals:** routing accuracy = —; false-alarm rate = —.

**Spend:** agent cost is not available in GitHub; see the [Cursor dashboard](https://cursor.com/dashboard) for usage and billing.

| PR | Branch | Plan rows (right/reviewed) | Min to first plan comment | Min to first QA report | Agent min (pr-triage) | Findings | False alarms |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| [#1](https://github.com/vskadorva/fernly-shop-practicum/pull/1) | feature/promo-codes | — | 8.7 | — | 88.8 | 0 | 0 |

## How each number is measured

- **Pull requests:** every open or closed PR with the `plan-approved` label (`gh pr list --label plan-approved --state all`).
- **Plan rows (right/reviewed):** the last issue comment on that PR from a human (non-bot) author whose body starts with `Plan review: N/M`.
- **Min to first plan comment:** minutes from PR `createdAt` to the first issue comment by GitHub Actions that is not a QA report (body does not start with `<!-- fernly-qa-report -->`).
- **Min to first QA report:** minutes from PR `createdAt` to the first issue comment whose body starts with `<!-- fernly-qa-report -->`.
- **Agent min:** sum of wall-clock minutes for completed `pr-triage.yml` workflow runs on the PR head branch (`updatedAt − createdAt` per run).
- **Findings:** open or closed issues labeled `qa-finding` whose body links to that pull request.
- **False alarms:** those findings that are closed with GitHub state reason **not planned** (`NOT_PLANNED`).
- **Routing accuracy:** Σ plan rows right ÷ Σ plan rows reviewed across labeled PRs.
- **False-alarm rate:** Σ false alarms ÷ Σ findings across labeled PRs.

