# Cart page promo — test design

Page: `web/src/pages/CartPage.tsx` (`/cart`) and the cart-summary slot `web/src/slots/cart-summary/promo-code.tsx`. The signed-in shell also calls `GET /api/auth/me` and `GET /api/cart`. Follow the stubbing style in `web/cypress/ui/cart.cy.ts` (token `fernly_token`, intercept only `/api/*`). Do not edit `cart.cy.ts`.

Status: **approved** — the human approved `docs/test-plans/feature/promo-codes.md` row U1 and asked for these tests. Spec: `web/cypress/ui/cart-promo.cy.ts`. One test per row. Title starts with the row ID. Tag `{ tags: '@ui' }`. One fixture file per scenario under `web/cypress/fixtures/promo/`.

Prices the customer sees use two decimals (`$18.20`, never `$18.2`). The discount minus sign is `−` (U+2212). A new code replaces the old one without a required Remove in between: do not click Remove before the second Apply.

| ID | kind | given (API answer) | the user does | expected | source | technique |
| --- | --- | --- | --- | --- | --- | --- |
| U1-01 | positive | Signed in. `GET /api/cart` is `promo/cart-pothos.json` (one Small Pothos, no code, shipping 6.95, total 19.45). `POST /api/cart/promo` returns 200 `promo/cart-pothos-leafy10.json`. | opens `/cart`, sees the field under the summary, types `leafy10`, clicks **Apply** | **Promo code** field and **Apply** sit under the order summary (below that region). Shipping `$6.95`, total `$19.45` before apply. After the POST alias: `Discount (LEAFY10)`, `−$1.25`, total `$18.20`, and `LEAFY10` is visible. | feature field under the order summary; `docs/PRODUCT.md` two decimals | positive + interaction |
| U1-02 | positive | Signed in. `GET /api/cart` is `promo/cart-pothos-leafy10.json`. `DELETE /api/cart/promo` returns 200 `promo/cart-pothos.json`. | clicks **Remove** | Waits on the DELETE alias. Summary has no Discount row, shipping `$6.95`, total `$19.45`, and the empty promo field is back. | feature: Remove takes it off | interaction |
| U1-03 | negative | No token | opens `/cart` | URL includes `/login?next=/cart`. No promo field. | `docs/APP-MAP.md` signed-out redirect | signed out |
| U1-04 | negative | Signed in. `GET /api/cart` returns 500 | opens `/cart` | Alert `Your cart couldn't be loaded.` and **Try again**. No promo field. | `docs/APP-MAP.md` cart error | error 500 |
| U1-05 | negative | Signed in. `GET /api/cart` is `promo/cart-pothos.json`. `POST /api/cart/promo` returns 400 `{ "detail": "This code has expired.", "rule": "promo_invalid" }` | types `SPRING5` and clicks **Apply** | That message is visible and is in `role="alert"` or `aria-live="assertive"`. Totals stay `$19.45`. No Discount row. | feature: expired message announced as soon as it appears | error from the API |
| U1-06 | edge | Signed in. `GET /api/cart` is `promo/cart-empty.json` | opens `/cart` | `Your cart is empty` and `Plants you add will show up here.` No order summary and no promo field. | `docs/APP-MAP.md` empty cart copy | empty |
| U1-07 | edge | Signed in. `GET /api/cart` is `promo/cart-pothos.json`. `POST /api/cart/promo` returns `promo/cart-pothos-leafy10.json` with `delay: 1000` | types `leafy10` and clicks **Apply** | **Apply** is disabled until the alias resolves. Then the total is `$18.20`. No fixed `cy.wait(n)`. | slot `busy` while the mutation is pending | slow answer |
| U1-08 | edge | Signed in. Start from `promo/cart-pothos.json`. First `POST /api/cart/promo` returns `promo/cart-pothos-leafy10.json`. A later `POST` returns `promo/cart-pothos-freeship.json`. | applies `leafy10`, then types `FREESHIP` into the promo field and applies it, without clicking Remove | Shipping **Free**, no Discount row, total `$12.50`. | feature: applying a new code replaces the old one. Free-shipping code makes shipping $0.00. | replacement |
| U1-09 | accessibility | Signed in. `GET /api/cart` is `promo/cart-pothos.json`. POST stub as U1-01. | uses the keyboard on the field | The field’s accessible name is the visible **Promo code** label. **Apply** is reached from the keyboard. Typing a code and pressing Enter applies it (same discounted summary as U1-01). | `docs/PRODUCT.md` names and keyboard. Feature visible label. | accessibility |

## Fixtures

`promo/cart-pothos.json`: one line `pl-pothos` / `Pothos 'Golden'` / size `S` / `unitPrice` 12.5 / quantity 1 / `lineTotal` 12.5 / stock 30, `itemCount` 1, `subtotal` 12.5, `discount` 0, `promoCode` null, `shipping` 6.95, `total` 19.45.

`promo/cart-pothos-leafy10.json`: same line, `discount` 1.25, `promoCode` `LEAFY10`, `shipping` 6.95, `total` 18.2.

`promo/cart-pothos-freeship.json`: same line, `discount` 0, `promoCode` `FREESHIP`, `shipping` 0, `total` 12.5.

`promo/cart-empty.json`: `lines` [], `itemCount` 0, `subtotal` 0, `discount` 0, `promoCode` null, `shipping` 0, `total` 0.

Reuse `web/cypress/fixtures/cart/me-user.json` for `GET /api/auth/me`.
