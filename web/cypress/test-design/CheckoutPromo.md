# Checkout promo — test design

Page: `web/src/pages/CheckoutPage.tsx` (`/checkout`). Signed-in shell calls `GET /api/auth/me` and `GET /api/cart`. Stub only `/api/*`. Reuse `web/cypress/fixtures/cart/me-user.json` and the cart fixtures from `web/cypress/test-design/CartPromo.md`.

Status: **approved** — the human approved `docs/test-plans/feature/promo-codes.md` row U2 and asked for these tests. Spec: `web/cypress/ui/checkout-promo.cy.ts`. One test per row. Title starts with the row ID. Tag `{ tags: '@ui' }`.

The discount minus sign is `−` (U+2212). Prices show two decimals.

| ID | kind | given | the user does | expected | source | technique |
| --- | --- | --- | --- | --- | --- | --- |
| U2-01 | positive | Signed in. `GET /api/cart` is `promo/cart-pothos-leafy10.json` | opens `/checkout` | Summary shows `Discount (LEAFY10)`, `−$1.25`, shipping `$6.95`, total `$18.20` | feature percentage line. `docs/PRODUCT.md` two decimals and checkout charges the cart as it is. | normal cart |
| U2-02 | negative | No token | opens `/checkout` | URL includes `/login?next=/checkout` | `docs/APP-MAP.md` signed-out redirect | signed out |
| U2-03 | negative | Signed in. `GET /api/cart` is `promo/cart-empty.json` | opens `/checkout` | `Your cart is empty` and `Add a plant before you check out.` | `docs/APP-MAP.md` checkout empty copy | empty |
| U2-04 | negative | Signed in. `GET /api/cart` returns 500 | opens `/checkout` | `Your cart couldn't be loaded.` and **Try again** | `docs/APP-MAP.md` checkout load error | error 500 |
| U2-05 | edge | Signed in. `GET /api/cart` is `promo/cart-pothos-freeship.json` | opens `/checkout` | Shipping **Free**, no Discount row, total `$12.50` | feature: a free-shipping code makes shipping $0.00 | free-shipping code |
| U2-06 | accessibility | Same cart as U2-01 | reads the summary | The heading **Order summary** names the region. Discount text contrasts at least 4.5:1 with its background. | `docs/PRODUCT.md` contrast 4.5:1. Summary named by its heading. | accessibility |

## Out of scope

Placing the order against the real API is E1, not this mocked page.
