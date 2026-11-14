# Cart page — test design

Page: `web/src/pages/CartPage.tsx` (`/cart`). API: `GET /api/cart`; `PATCH /api/cart/lines/{lineId}`; `DELETE /api/cart/lines/{lineId}`. Renders `CartLine`, `OrderSummary`, `CartSummarySlot` (empty slot folder today), empty/error/loading states, checkout link.

Status: **approved** — implemented in `web/cypress/ui/cart.cy.ts`.

| ID | kind | given | the user does | expected | source | technique |
|----|------|-------|---------------|----------|--------|-----------|
| CP-01 | positive | Signed in (`fernly_token` + stub `GET /api/auth/me`); `GET /api/cart` returns one line (name, size, qty, prices, stock) with subtotal under $50, shipping $6.95, totals consistent | opens `/cart` | heading "Your cart"; line shows plant name, size, unit and line prices, quantity stepper, Remove; order summary shows item count, subtotal, shipping as a price (not "Free"), total; link "Go to checkout" | APP-MAP.md `/cart`; PRODUCT.md two-decimal prices | equivalence class: one line, paid shipping |
| CP-02 | positive | Signed in; cart fixture with subtotal ≥ $50.00, shipping `0`, items present | opens `/cart` | order summary shows **Free** for shipping (not `$0.00` alone); total equals subtotal | PRODUCT.md: "Shipping costs $6.95, and is free when the subtotal is $50.00 or more." | boundary: at free-shipping threshold |
| CP-03 | positive | Signed in; cart fixture with subtotal under $50 and `itemCount > 0` | opens `/cart` | hint "Add $X.XX more for free shipping." with two-decimal dollars | `OrderSummary` + PRODUCT.md two-decimal prices | equivalence class: below threshold |
| CP-04 | edge | Signed in; cart line with a very long `name` (same spirit as browse-long-name) | opens `/cart` | long name stays inside the line layout (no horizontal overflow past the line/card bounds) | PRODUCT.md accessibility + browse long-name precedent | boundary: extreme string length |
| CP-05 | edge | Signed in; line with `unitPrice` or totals at `0` | opens `/cart` | prices show `$0.00` | PRODUCT.md: two decimals everywhere | boundary: zero price |
| CP-06 | negative | Not signed in (no token); cart API not required | opens `/cart` | browser ends on `/login?next=/cart` | APP-MAP.md: "Signed out: redirect to `/login?next=/cart`" | equivalence class: unsigned |
| CP-07 | negative | Signed in; `GET /api/cart` returns 500 | opens `/cart` | alert "Your cart couldn't be loaded." with **Try again**; retry re-fetches cart | APP-MAP.md error state; PRODUCT.md Try again pattern (browse) | equivalence class: load failure |
| CP-08 | negative | Signed in; `GET /api/cart` returns empty cart (`lines: []`) | opens `/cart` | "Your cart is empty" / "Plants you add will show up here." and link **Browse plants** to `/` | APP-MAP.md empty state | equivalence class: empty |
| CP-09 | interaction | Signed in; cart with one line at quantity 1, stock > 1; stub `PATCH /api/cart/lines/{id}` returns updated cart | clicks **Increase quantity** | waits on PATCH alias; quantity output updates to match stub; UI reflects new line total and summary numbers from response | APP-MAP.md PATCH on stepper; PRODUCT.md stock limit (not at limit yet) | interaction + API alias |
| CP-10 | interaction | Signed in; line at quantity = `stock`; stub PATCH not called | clicks **Increase quantity** | **Increase quantity** is disabled; quantity unchanged | PRODUCT.md: "at the stock limit, the **+** button is disabled" | boundary: at stock |
| CP-11 | interaction | Signed in; cart with one line; stub `DELETE /api/cart/lines/{id}` returns empty cart | clicks **Remove {name}** | waits on DELETE alias; empty cart state (CP-08) or line gone if multi-line fixture | APP-MAP.md DELETE on Remove | interaction + API alias |
| CP-12 | state | Signed in; cart loaded; stub PATCH with deliberate delay | clicks **Increase quantity** | while PATCH pending, every line's stepper (−/+) and **Remove** buttons are disabled | APP-MAP.md: "Busy: while a change is being saved, every stepper and Remove button is disabled" | state: pending mutation |
| CP-13 | negative | Signed in; cart loaded; stub PATCH returns 400 `{ detail: "…" }` (e.g. stock_limit) | clicks **Increase quantity** | error toast shows API `detail`; cart stays on previous quantity | APP-MAP.md: "Change rejected: error toast with the API's `detail`" | equivalence class: rejected change |
| CP-14 | interaction | Signed in; non-empty cart | clicks **Go to checkout** | navigates to `/checkout` | APP-MAP.md checkout link | interaction: navigation |
| CP-15 | accessibility | Signed in; cart with at least one line | uses keyboard only: tab to quantity −/+, Remove, checkout link | each control is focusable and has an accessible name (stepper group label "Quantity of {name}", Remove "Remove {name}") | PRODUCT.md WCAG: named controls | accessibility basics |
| CP-16 | edge | Signed in; `GET /api/cart` stubbed with `delay` (e.g. 2s) | opens `/cart` immediately | shows "Loading your cart…" until cart response; then CP-01 content | APP-MAP.md loading copy | state: slow network (no fixed sleep) |
| CP-17 | positive | Signed in; cart fixture with **two** lines, mixed sizes | opens `/cart` | two list items; summary `itemCount` matches sum of quantities | APP-MAP.md one CartLine per line | equivalence class: multiple lines |

## Assumed — ask

| ID | kind | given | the user does | expected | source | technique |
|----|------|-------|---------------|----------|--------|-----------|
| CP-A1 | edge | Signed in; subtotal exactly $49.99, one cent below free shipping | opens `/cart` | assumed — ask: shipping $6.95 and hint for $0.01, or does API round differently? | no document says | boundary: one cent below threshold |
| CP-A2 | interaction | Signed in; multi-line cart; PATCH on line A in flight | clicks Remove on line B | assumed — ask: should line B stay enabled, or is global busy intentional for the whole cart? | APP-MAP says "every" control disabled | state: concurrent edits |

## Out of scope (other targets)

- **CartLine** / **QuantityStepper** / **PriceTag** / **OrderSummary** in isolation — component tests (see `QuantityStepper.cy.tsx`, `PriceTag.md`).
- **CartSummarySlot** — slot folders empty; add rows when a slot ships.
- **Header cart badge** — owned by `Layout` + `GET /api/cart`, not Cart page body.
- **Checkout** — separate page design.
- End-to-end add-from-plant then open cart (optional integration; UI tests here stub `GET /api/cart` fixtures under `web/cypress/fixtures/cart/`).

## Fixture sketch (for implementation)

One JSON file per scenario, mirroring `Cart` in `web/src/types.ts` (lines + `itemCount`, `subtotal`, `shipping`, `total` aligned with API rules). Signed-in helper: set `fernly_token`, stub `GET /api/auth/me`, stub `GET /api/cart` (and PATCH/DELETE as needed).
