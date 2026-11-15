# Results: feature/back-in-stock

Plan: `docs/test-plans/feature/back-in-stock.md` (approved in chat). Application code was not changed. A failed assertion that matches its row is a possible finding. Snapshots were not updated.

T0 is for a person. Q1–Q5 are `assumed — ask`. No test was written for them.

Commands (executed):

- `npx cypress run --component --spec cypress/component/StockBadge.cy.tsx,cypress/component/NotifyForm.cy.tsx` (from `web/`) — StockBadge failed. NotifyForm failed on a query that cannot match zero buttons; re-ran NotifyForm alone after that query fix: passed.
- `npx playwright test tests/api/back-in-stock.spec.ts --project=api` — 3 passed, 3 failed (the first run skipped A3–SCH1 because the file was serial; re-ran without that).
- `npx playwright test tests/e2e/back-in-stock.spec.ts --project=e2e` — failed. A second run, after waiting for the confirmation or the alert, failed the same documented checks.
- `npx playwright test tests/e2e/back-in-stock-browse.spec.ts --project=e2e` — failed.
- `npx playwright test tests/a11y/back-in-stock.spec.ts --project=a11y` — failed.
- `npx playwright test tests/visual/catalog.spec.ts --project=visual` — 2 passed, 1 failed. Snapshots were not updated.
- `npx cypress run --e2e --spec cypress/ui/stock-badge.cy.ts,cypress/ui/back-in-stock.cy.ts` (from `web/`, shop on port 5173) — stock badge failed. Plant page failed because `status` also matches the quantity stepper; re-ran that spec after scoping the confirmation: passed.

| row ID | test (path or command) | result (pass/fail/skip) | possible finding |
| --- | --- | --- | --- |
| P1 | `tests/api/back-in-stock.spec.ts` — P1 signs up with no account and does not publish the list | pass | No token returns 201 for `ava@fernly.test`, not 401. `GET /api/plants/pl-pilea/notify` is not 200 and does not list the address. Ben’s token signing up the same address is also 201 and the body email stays `ava@fernly.test`. |
| T0 | — | skip | A person reviews the note at the top of `api/src/features/back-in-stock.ts`. No test. |
| A1 | same file — A1 signs up an out-of-stock plant and 404s an unknown plant | pass | `pl-pilea` 201 `NotifyResult` for two emails. `pl-nope` is 404 with `detail` and no `rule`. After buying both Thai Monsteras, `pl-thai` is 201. |
| A2 | same file — A2 accepts only a full email address | fail | **F-19.** `a@b`, `name@`, and `@example.com` return 201 `subscribed`. `plain`, `""`, and `{}` return 400 `validation_error`. `name@example.com` and `ava@fernly.test` still return 201. |
| A3 | same file — A3 allows one sign-up per email per plant, ignoring case | fail | **F-20.** The second `ava@fernly.test` and `AVA@Fernly.TEST` on `pl-pilea` return 201, expected 409 `already_subscribed`. The first signup, the same email on sold-out `pl-thai`, a different email, and the signup after reset returned 201. |
| A4 | same file — A4 refuses sign-ups for plants that are still in stock | pass | `pl-monstera`, `pl-hoya`, `pl-pearls`, and `pl-thai` return 400 `in_stock`. After both Thai Monsteras are bought, the same email returns 201, not 409. |
| SCH1 | same file — SCH1 matches NotifyResult and the error shape on notify responses | fail | **F-20.** The second signup is 201, expected 409 `already_subscribed`. `NotifyRequest`, the 201 `NotifyResult`, 400 `validation_error`, 400 `in_stock`, and the 404 with no `rule` matched. |
| C1 | `web/cypress/component/StockBadge.cy.tsx` C1 | fail | **F-17.** Stock 0 renders `Only 0 left`. Stock 1, 2, and 3 render the badge (contrast at least 4.5:1) and stock 4 and 20 render nothing. Screenshot under `web/cypress/screenshots/StockBadge.cy.tsx/`. |
| C2 | `web/cypress/component/NotifyForm.cy.tsx` C2 | pass | Label, trimmed submit, `a@b` passed through, disabled empty/spaces/busy, alert, status confirmation, keyboard, and focus outline. |
| U1 | `web/cypress/ui/stock-badge.cy.ts` U1 | fail | **F-17.** The Chinese Money Plant card includes `Only 0 left` as well as "Out of stock". The test stopped there, so it did not reach the overlap check (see **F-18** / E2). Screenshot under `web/cypress/screenshots/stock-badge.cy.ts/`. |
| U2 | `web/cypress/ui/back-in-stock.cy.ts` U2 | pass | Out-of-stock page shows the form under the description, posts `{ "email": "name@example.com" }`, and confirms. In-stock Monstera has no form. Stubbed 400, 409, and 500 messages stay on the form; the 500 keeps the typed address. Signed out, no redirect to `/login`. Stepper and "Out of stock" stay disabled. |
| E1 | `tests/e2e/back-in-stock.spec.ts` E1 | fail | **F-19** and **F-20.** Keyboard signup of `keys@example.com` and the Notify me signup of `Name@Example.com` confirm. `a@b` and `name@` confirm instead of an alert. `AVA@fernly.test` after `ava@fernly.test` confirms again; "You're already on the list" is not shown. |
| E2 | `tests/e2e/back-in-stock-browse.spec.ts` E2 | fail | **F-18.** The badge intersects the photo and the save button at desktop (Pearls, Thai, Hoya) and at phone width (Pearls, Hoya). **F-17.** Chinese Money Plant, and the Thai card after the last one is bought, still show "Only N left" beside "Out of stock". Buying one of the two Thai plants did show "Only 1 left", and the sold-out plant page did show the form. Fiddle (4) and Monstera (12) have no badge. |
| V1 | `npx playwright test tests/visual/catalog.spec.ts --project=visual` | fail | Catalog first screen and the Monstera card matched. **Hoya Carnosa card (low stock)** differs by 189 pixels: an "Only 3 left" chip on the top-right of the photo (`hoya-carnosa-card.png`). Snapshots were not updated. Same placement as **F-18**. A person should look at the diff. |
| X1 | `tests/a11y/back-in-stock.spec.ts` X1 | fail | The email field’s accessible name is "Email me when it's back". Badge contrast for "Only 1 left" is at least 4.5:1. The empty form, Browse, and the confirmation scans fail on existing issues: price contrast (**F-09**), plant image alt (**F-08**), save button name (**F-07**), and the unnamed search field (Suspicions). `a@b` produced no alert (**F-19**), so the refusal scan did not run. `a11y-baseline.json` was not edited. |
| Q1 | — | skip | assumed — ask. No test. |
| Q2 | — | skip | assumed — ask. No test. |
| Q3 | — | skip | assumed — ask. No test. |
| Q4 | — | skip | assumed — ask. No test. |
| Q5 | — | skip | assumed — ask. No test. |
