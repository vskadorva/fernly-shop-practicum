# PriceTag — test design

Component: `web/src/components/PriceTag.tsx`. Props: `amount: number`, `size?: 'sm' | 'md' | 'lg'` (default `md`), `label?: string` (read by screen readers before the price, not shown). Text comes from `formatPrice` in `web/src/money.ts`.

Used on: `PlantCard` (price), `PlantPage` (`lg`, label "Price"), `CartLine` (`sm` "Price each", `md` "Line total"), `OrderSummary` (subtotal, shipping, `lg` total), `OrdersPage` ("Total", "Line total").

Status: **awaiting approval** — no test code yet.

| ID | kind | given | the user does | expected | source | technique |
|----|------|-------|---------------|----------|--------|-----------|
| PT-01 | render | `amount={12.5}` | looks at the price | text is `$12.50` | PRODUCT.md: "Every price is shown in dollars with **two decimals**, everywhere: `$12.50`, never `$12.5`." | equivalence class: one decimal place |
| PT-02 | render | `amount={50}` | looks at the price | text is `$50.00` | same line | equivalence class: whole dollars |
| PT-03 | render | `amount={24.99}` | looks at the price | text is `$24.99` | same line | equivalence class: two decimal places |
| PT-04 | boundary | `amount={0}` | looks at the price | text is `$0.00` | same line | boundary: 0 |
| PT-05 | boundary | `amount={0.01}` | looks at the price | text is `$0.01` | same line | boundary: smallest cent |
| PT-06 | boundary | `amount={6.95}` | looks at the price | text is `$6.95` | PRODUCT.md: "Shipping costs $6.95 …" + the two-decimals line | boundary: a value the rules name |
| PT-07 | boundary | `amount={0.1 + 0.2}` (0.30000000000000004) | looks at the price | text is `$0.30` | two-decimals line | boundary: floating-point sum |
| PT-08 | boundary | `amount={12.345}` | looks at the price | assumed — ask: round half up (`$12.35`), or whatever floating point gives (`$12.34`)? | no document says | equivalence class: more than two decimals |
| PT-09 | boundary | `amount={1234.5}` | looks at the price | assumed — ask: `$1,234.50` or `$1234.50`? | no document says | equivalence class: four-digit dollars |
| PT-10 | boundary | `amount={-5}` | looks at the price | assumed — ask: can a negative amount reach PriceTag, and how is it shown? | no document says | equivalence class: invalid (negative) |
| PT-11 | accessibility | `amount={12.5}`, `label="Subtotal"` | reads it with a screen reader | accessible text is `Subtotal: $12.50`; the label text is not visible on screen | the component's purpose (`label` prop comment) | equivalence class: label given |
| PT-12 | render | `amount={12.5}`, no `label` | reads it with a screen reader | text is exactly `$12.50`, no hidden prefix | the component's purpose | equivalence class: label absent |
| PT-13 | boundary | `amount={12.5}`, `label=""` | reads it with a screen reader | same as PT-12, no stray `: ` | the component's purpose | boundary: empty string |
| PT-14 | render | `amount={12.5}`, no `size` | looks at the price | renders at the `md` size (same font size as `size="md"`) | the component's purpose (default `md`) | equivalence class: default value |
| PT-15 | render | `amount={12.5}`, `size` = `sm`, `md`, `lg` (three mounts) | looks at the price | font size grows from `sm` to `md` to `lg` | the component's purpose | equivalence class: each `size` value |
| PT-16 | accessibility | `amount={12.5}`, each `size`, on the page background `#f6faf3` (from `global.css`) | looks at the price | text colour against the background is at least 4.5:1 (`sm`, `md`); at least 3:1 for `lg` if it counts as large bold text | PRODUCT.md: "text has enough contrast against its background (4.5:1 for normal text)" | accessibility basics: contrast |

## Expected to fail today (inspected, not yet tested)

`formatPrice` is `` `$${Math.round(amount * 100) / 100}` ``, with no fixed two decimals. Reading it:

- PT-01 gives `$12.5`, PT-02 gives `$50`, PT-04 gives `$0`, PT-07 gives `$0.3`. These would confirm the `formatPrice` / `PriceTag` suspicion in `FINDINGS.md`.
- PT-16: `#8dbb8a` on `#f6faf3` measures 2.07:1, below both 4.5:1 and 3:1. This would confirm the `PriceTag` colour suspicion.

## Out of scope

`SizePicker` ("+$6") and the `OrderSummary` free-shipping hint call `formatPrice` directly, not `PriceTag`, so these tests won't cover them. They need their own rows in a `SizePicker` / `OrderSummary` design.
