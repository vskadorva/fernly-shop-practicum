# Orders promo — test design

Pages: `web/src/pages/OrdersPage.tsx` list (`/orders`) and order (`/orders/:orderId`). Signed-in shell also calls `GET /api/auth/me` and `GET /api/cart` (stub the cart with `promo/cart-empty.json` so the header does not hit the network). Stub only `/api/*`.

Status: **approved** — the human approved `docs/test-plans/feature/promo-codes.md` row U3 and asked for these tests. Spec: `web/cypress/ui/orders-promo.cy.ts`. One test per row. Title starts with the row ID. Tag `{ tags: '@ui' }`.

The discount minus sign is `−` (U+2212). Prices show two decimals. The paid summary’s heading is **Paid**.

| ID | kind | given | the user does | expected | source | technique |
| --- | --- | --- | --- | --- | --- | --- |
| U3-01 | positive | Signed in. `GET /api/orders/ord-leafy` is `promo/order-leafy10.json` | opens `/orders/ord-leafy` | Heading **Paid** on the summary. `Discount (LEAFY10)`, `−$1.25`, total `$18.20`. | feature: the order keeps the discount and the code. `docs/APP-MAP.md` summary titled **Paid**. `docs/PRODUCT.md` two decimals. | normal order |
| U3-02 | positive | Signed in. `GET /api/orders` is `promo/orders-leafy10.json` | opens `/orders` | That order’s total is shown as `$18.20` | `docs/APP-MAP.md` the list shows the total. `docs/PRODUCT.md` two decimals. | list total |
| U3-03 | negative | No token | opens `/orders` | URL includes `/login?next=/orders` | `docs/APP-MAP.md` signed-out redirect | signed out |
| U3-04 | negative | No token | opens `/orders/ord-leafy` | URL includes `/login?next=/orders/ord-leafy` | `docs/APP-MAP.md` signed-out redirect with `next` set to that path | signed out |
| U3-05 | negative | Signed in. `GET /api/orders/ord-missing` returns 404 | opens `/orders/ord-missing` | `Order not found`. No Discount text and no total price. | `docs/APP-MAP.md` 404 **Order not found**. `docs/PRODUCT.md` an order is private. | not found |
| U3-06 | negative | Signed in. `GET /api/orders/ord-leafy` returns 500 | opens `/orders/ord-leafy` | `The order couldn't be loaded.` and **Try again** | `docs/APP-MAP.md` other load error | error 500 |
| U3-07 | edge | Signed in. `GET /api/orders/ord-plain` is `promo/order-plain.json`. `GET /api/orders` is `promo/orders-plain.json`. | opens the order page, then the list | No Discount row on the order. The list total is `$19.45` (the order’s undiscounted total). | feature line is omitted when there is no code. List shows `total`. | no code |
| U3-08 | accessibility | Same order as U3-01 | reads the paid summary | **Paid** names the summary region. Discount text contrasts at least 4.5:1 with its background. | `docs/PRODUCT.md` contrast 4.5:1. `docs/APP-MAP.md` heading **Paid**. | accessibility |

## Fixtures

`promo/order-leafy10.json`: `id` `ord-leafy`, `status` `placed`, `createdAt` `2026-11-01T15:00:00.000Z`, one line for `Pothos 'Golden'` size `S` quantity 1 `unitPrice` 12.5 `lineTotal` 12.5 (no `stock` field), `subtotal` 12.5, `discount` 1.25, `promoCode` `LEAFY10`, `shipping` 6.95, `total` 18.2, `shippingAddress` `{ "fullName": "Ava Green", "address": "1 Fern Lane", "city": "Portland", "postalCode": "97201" }`.

`promo/orders-leafy10.json`: an array of that one order.

`promo/order-plain.json`: same shape, `id` `ord-plain`, `discount` 0, `promoCode` null, `shipping` 6.95, `total` 19.45.

`promo/orders-plain.json`: an array of that one order.
