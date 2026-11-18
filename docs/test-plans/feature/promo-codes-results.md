# Results: feature/promo-codes

Plan: `docs/test-plans/feature/promo-codes.md` (approved in chat). Application code was not changed. A failed assertion that matches its row is a possible finding.

Q1–Q4 are `assumed — ask`. No test was written for them.

Commands (executed):

- `npx playwright test tests/api/promo-codes.spec.ts --project=api` — 12 passed, 12 failed. **P1** was re-run after the 404 check was moved ahead of the cent check, and failed on `200` vs `404`.
- `npx playwright test tests/e2e/promo-codes.spec.ts --project=e2e` — 1 passed, 4 failed (after fixing two locators that matched the wrong element).
- `npx playwright test tests/a11y/promo.spec.ts --project=a11y` — empty-field, checkout, order, and expired-code scans failed. The applied-code cart scan passed after the Remove locator was made exact.
- `npx cypress run --component --spec cypress/component/OrderSummary.cy.tsx,cypress/component/PromoCodeInput.cy.tsx` (from `web/`) — OrderSummary 4 passed, 2 failed. PromoCodeInput 4 passed, 8 failed.
- `npx cypress run --e2e --spec cypress/ui/cart-promo.cy.ts,cypress/ui/checkout-promo.cy.ts,cypress/ui/orders-promo.cy.ts` (from `web/`, shop on port 5173) — cart 3 passed, 6 failed; checkout 4 passed, 2 failed; orders 6 passed, 2 failed.

| row ID | test (path or command) | result (pass/fail/skip) | possible finding |
| --- | --- | --- | --- |
| M1 | `tests/api/promo-codes.spec.ts` — LEAFY10 on one Small Pothos | fail | **F-10.** Discount `1.95`, expected `1.25`. Shipping stayed `6.95`. |
| M1 | same file — 10% of a $0.99 cutting | fail | **F-10.** Discount `0.79`, expected `0.10`. |
| M1 | same file — $49.00 fiddle, percentage must not include shipping | fail | **F-10.** Discount `5.60`, expected `4.90` (10% of $49.00 + $6.95). |
| M1 | same file — quantity raised to 2 after LEAFY10 | fail | **F-10.** Discount `3.20`, expected `2.50`. |
| M2 | same file — FREESHIP on one Small Pothos | pass | — |
| M2 | same file — FREESHIP on a $50.00 Bird of Paradise | pass | — |
| M3 | same file — $50.00 subtotal stays free after LEAFY10 | fail | **F-10.** Discount `5.70`, expected `5.00`. That figure is 10% of $50.00 + $6.95, so shipping was still charged (see **F-11**). |
| M3 | same file — $49.00 subtotal still pays shipping after LEAFY10 | pass | Shipping stayed `6.95`. |
| M4 | same file — order keeps LEAFY10 and the cart forgets it | fail | **F-10.** The order’s discount is `1.95`, expected `1.25`. The cart-empty checks did not run. |
| M4 | same file — order keeps FREESHIP and the cart forgets it | pass | Order `promoCode` `FREESHIP`, shipping `0`, total `12.50`. Cart `promoCode` null afterwards. |
| SCH1 | same file — cart routes and a cart with no code | pass | Pothos with no code: shipping `6.95`, total `19.45`. Empty cart: shipping `0`. Schema checks passed, including `POST` and `DELETE /api/cart/promo`. |
| SCH1 | same file — $50.00 Bird of Paradise with no code ships free | fail | **F-11.** Shipping `6.95`, expected `0`. Total was not `50.00`. |
| SCH1 | same file — order routes and the discounted order on the list | fail | **F-10.** `POST /api/orders`, `GET /api/orders/{orderId}`, and `GET /api/orders` all carry discount `1.95`, expected `1.25`. Schemas matched. |
| P1 | same file — another customer cannot see the code or the order | fail | **F-13.** Ben’s cart stays `promoCode` null and `discount` 0. Ben’s `GET /api/orders/{orderId}` for Ava’s order is `200`, expected `404`. |
| S1 | same file — promo routes without a token | pass | Both routes return `401` `auth_required`. The owner’s `LEAFY10` cart is unchanged. |
| B1 | same file — `leafy10` and `Leafy10` store `LEAFY10` | fail | **F-10.** Failed on discount `1.95` vs `1.25` before the catalog-code assertion. |
| B1 | same file — FREESHIP replaces LEAFY10 | pass | Second code is `FREESHIP`, discount `0`, shipping `0`, total `12.50`. |
| B1 | same file — DELETE clears a code, including when none is stored | pass | — |
| N1 | same file — expired `SPRING5` is refused and LEAFY10 stays | fail | **F-12.** Status `200`, expected `400` `promo_invalid`. |
| N1 | same file — unknown code is refused and LEAFY10 stays | pass | — |
| N1 | same file — code on an empty cart | pass | `400` `empty_cart`. Cart stays empty. |
| N1 | same file — missing or blank `code` | pass | Both `{}` and `{ "code": "" }` are `400` `validation_error` and leave `LEAFY10` in place. |
| N1 | same file — `spring5` is the same expired refusal | fail | **F-12.** Status `200`, expected `400`. |
| C1 | `web/cypress/component/OrderSummary.cy.tsx` C1-01 | fail | **F-01.** Shows `−$4`, `$40`, and `Add $10 more…`, expected `−$4.00`, `$40.00`, and `Add $10.00 more…`. Screenshot under `web/cypress/screenshots/OrderSummary.cy.tsx/`. |
| C1 | same file C1-02 | pass | No Discount row when discount is 0. |
| C1 | same file C1-03 | fail | **F-01.** Shows `−$4.9` and `Add $1 more…`, expected `−$4.90` and `Add $1.00 more…`. The hint is still based on the $49 subtotal. |
| C1 | same file C1-04 | pass | Shipping **Free**, no Discount row, no hint. |
| C1 | same file C1-05 | pass | Heading and region name **Paid**. |
| C1 | same file C1-06 | pass | Region name is the visible heading. Discount text contrast is at least 4.5:1. |
| C2 | `web/cypress/component/PromoCodeInput.cy.tsx` C2-01, C2-02, C2-04, C2-05, C2-07, C2-09, C2-12 | fail | **F-15.** No visible “Promo code” label. The input’s accessible name is empty, so these rows never get past that query. C2-04, C2-05, and C2-07 therefore did not reach the disabled-Apply checks. |
| C2 | same file C2-03 | pass | `LEAFY10` is shown and **Remove** calls `onRemove`. |
| C2 | same file C2-06 | pass | The expired sentence is visible when passed in as `error`. |
| C2 | same file C2-08 | pass | **Remove** is disabled while `busy`. |
| C2 | same file C2-10 | pass | **Remove** has an accessible name. |
| C2 | same file C2-11 | fail | **F-16.** The expired sentence is not in `role="alert"` or `aria-live="assertive"`. |
| U1 | `web/cypress/ui/cart-promo.cy.ts` U1-01, U1-02, U1-05, U1-07, U1-08, U1-09 | fail | **F-15.** Each looks up a textbox named “Promo code” and does not find one. U1-08 does not reach the second Apply (the real-API replace gap is **F-14** / E1). |
| U1 | same file U1-03 | pass | Signed out redirects to `/login?next=/cart`. |
| U1 | same file U1-04 | pass | Load error and **Try again**. No promo field. |
| U1 | same file U1-06 | pass | Empty cart copy. No summary and no promo field. |
| U2 | `web/cypress/ui/checkout-promo.cy.ts` U2-01 | fail | **F-01.** Total renders `$18.2`, expected `$18.20`. Discount `−$1.25` and shipping `$6.95` were found before that. |
| U2 | same file U2-02, U2-03, U2-04 | pass | Signed-out redirect, empty copy, load error with **Try again**. |
| U2 | same file U2-05 | fail | **F-01.** Total renders `$12.5`, expected `$12.50`. |
| U2 | same file U2-06 | pass | Region name **Order summary**. Discount text contrast at least 4.5:1. |
| U3 | `web/cypress/ui/orders-promo.cy.ts` U3-01 | fail | **F-01.** Paid summary shows Discount (LEAFY10) and `−$1.25`, and the total as `$18.2` instead of `$18.20`. |
| U3 | same file U3-02 | fail | **F-01.** List total is `$18.2`, expected `$18.20`. |
| U3 | same file U3-03, U3-04, U3-05, U3-06, U3-07, U3-08 | pass | Signed-out redirects, 404 **Order not found**, other load error, no Discount row with list total `$19.45`, **Paid** names the region, discount contrast passes. |
| E1 | `tests/e2e/promo-codes.spec.ts` — leafy10 from cart through the paid order | fail | **F-10.** `−$1.25` and `$18.20` are missing on the cart, checkout, paid summary, and orders list. Discount (LEAFY10) and `$6.95` do show. After placing the order the cart is empty, and adding the Pothos again has no discount line (those checks passed). |
| E1 | same file — expired SPRING5 is announced and the total stays | fail | **F-12.** No alert or assertive live region contains “expired”. |
| E1 | same file — unknown code is refused | pass | Total stays `$19.45` with no Discount row. |
| E1 | same file — FREESHIP replaces LEAFY10, then Remove | fail | **F-14.** After LEAFY10 the promo textbox is gone, so FREESHIP cannot be typed. |
| E1 | same file — visible “Promo code” label; Apply and Remove from the keyboard | fail | **F-15.** No textbox named “Promo code”. Keyboard checks did not run. |
| X1 | `tests/a11y/promo.spec.ts` — cart, line, empty promo field | fail | **F-15.** New blocking axe `label` (critical) on the promo input. Cart price contrast stays baselined and was not a new failure. |
| X1 | same file — cart after LEAFY10 | pass | No new blocking violations (page name `Cart`, so the existing colour-contrast baseline applies). |
| X1 | same file — checkout of the discounted cart | fail | **F-09.** New blocking `color-contrast` on price text (`#8dbb8a` on `#ffffff`, about 2.18:1). The rendered total in that scan is `$17.5` (**F-10**). |
| X1 | same file — paid order with the discount line | fail | **F-09.** Same price contrast on the order page. Rendered total `$17.5`. |
| X1 | same file — cart while the expired-code refusal is showing | fail | **F-12.** The refusal never appears, so it is not in an alert. The scan did not run. |
| Q1 | — | skip | assumed — ask. No expected result for spaces around a code. |
| Q2 | — | skip | assumed — ask. No expected result for a discount with no code. |
| Q3 | — | skip | assumed — ask. No expected result for the free-shipping hint while `FREESHIP` is applied under $50. |
| Q4 | — | skip | assumed — ask. No expected result for the code after the last plant is removed. |
