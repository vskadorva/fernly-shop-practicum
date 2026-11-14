# OrderSummary — test design

Component: `web/src/components/OrderSummary.tsx`. Props: `itemCount`, `subtotal`, `shipping`, `total`, optional `discount` (default 0), optional `promoCode` (default null), optional `title` (default `Order summary`).

Status: **approved** — the human approved `docs/test-plans/feature/promo-codes.md` row C1 and asked for these tests. Spec: `web/cypress/component/OrderSummary.cy.tsx`. One test per row. Title starts with the row ID. Tag `{ tags: '@component' }`.

The discount amount uses a Unicode minus (`−`, U+2212) plus the price, for example `−$4.00`. Expect that character. Expect two decimal places on every price (`$4.00`, never `$4`). Do not change those strings if the screen shows something else.

| ID | kind | given | the user does | expected | source | technique |
| --- | --- | --- | --- | --- | --- | --- |
| C1-01 | render | `itemCount` 1, `subtotal` 40, `discount` 4, `promoCode` `LEAFY10`, `shipping` 6.95, `total` 42.95 | looks at the summary | Region named **Order summary**. Text `Discount (LEAFY10)` and `−$4.00`. Subtotal `$40.00`. Shipping `$6.95`. Total `$42.95`. Hint `Add $10.00 more for free shipping.` | `docs/features/promo-codes.md` line `Discount (LEAFY10) −$4.00`. `docs/PRODUCT.md` two decimals. `docs/APP-MAP.md` hint when the subtotal is under $50. | equivalence class: percentage discount under $50 |
| C1-02 | negative | `itemCount` 1, `subtotal` 12.5, `discount` 0, `promoCode` null, `shipping` 6.95, `total` 19.45 | looks at the summary | No element whose text matches `Discount` | feature line includes the code only when a discount is shown | equivalence class: no code |
| C1-03 | boundary | `itemCount` 1, `subtotal` 49, `discount` 4.9, `promoCode` `LEAFY10`, `shipping` 6.95, `total` 51.05 | looks at the summary | `Discount (LEAFY10)` and `−$4.90`. Hint `Add $1.00 more for free shipping.` The hint uses the subtotal, which is still under $50.00. | feature: threshold on the subtotal before the discount. `docs/PRODUCT.md` two decimals. | boundary: one dollar under free shipping |
| C1-04 | boundary | `itemCount` 1, `subtotal` 50, `discount` 0, `promoCode` null, `shipping` 0, `total` 50 | looks at the summary | Shipping text **Free**. No `Discount` text. No free-shipping hint. | `docs/PRODUCT.md` free at $50.00. `docs/APP-MAP.md` **Free** when shipping is 0 and there are items. | boundary: at the free-shipping threshold |
| C1-05 | render | `title` `Paid`, `itemCount` 1, `subtotal` 12.5, `discount` 1.25, `promoCode` `LEAFY10`, `shipping` 6.95, `total` 18.2 | looks at the summary | Visible heading **Paid**. The region’s accessible name is **Paid**. | `docs/APP-MAP.md` order page `OrderSummary` titled **Paid**. | equivalence class: title prop |
| C1-06 | accessibility | same props as C1-01 | reads the region and the discount text | The region’s accessible name is the visible heading **Order summary**. The discount text’s colour against its background is at least 4.5:1. | `docs/PRODUCT.md` contrast 4.5:1 for normal text. The summary is named by its heading. | accessibility: name and contrast |

## Out of scope

Page wiring, the promo field, and the real API. Those are U1–U3 and the Playwright rows.
