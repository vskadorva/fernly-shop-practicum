# PromoCodeInput — test design

Component: `web/src/components/PromoCodeInput.tsx`. Props: `appliedCode: string | null`, `onApply: (code: string) => void`, `onRemove: () => void`, optional `error: string | null`, optional `busy: boolean`.

Status: **approved** — the human approved `docs/test-plans/feature/promo-codes.md` row C2 and asked for these tests. Spec: `web/cypress/component/PromoCodeInput.cy.tsx`. One test per row. Title starts with the row ID. Tag `{ tags: '@component' }`.

| ID | kind | given | the user does | expected | source | technique |
| --- | --- | --- | --- | --- | --- | --- |
| C2-01 | render | `appliedCode` null | looks | A visible label **Promo code** names the text field. A button named **Apply** is shown. | `docs/features/promo-codes.md` “The code field has a visible label.” Apply button. `docs/PRODUCT.md` every form field has a name. | equivalence class: no code yet |
| C2-02 | interaction | `appliedCode` null, `onApply` spy | types `leafy10` and submits | `onApply` is called once with `leafy10` (the trimmed text the customer typed, not forced to upper case) | feature: the customer types a code; the API ignores letter case | callback |
| C2-03 | interaction | `appliedCode` `LEAFY10`, `onRemove` spy | looks, then clicks **Remove** | `LEAFY10` is visible. The button named **Remove** calls `onRemove`. | feature: “Remove takes it off.” | interaction |
| C2-04 | negative | `appliedCode` null, `onApply` spy | leaves the field empty and presses Enter | **Apply** is disabled. `onApply` is not called. | an empty code is not a code | state: disabled |
| C2-05 | boundary | `appliedCode` null, `onApply` spy | types only spaces | **Apply** stays disabled. `onApply` is not called. | whitespace is not a code | boundary: whitespace |
| C2-06 | negative | `error` `This code has expired.` | looks | That sentence is visible. | feature: expired codes are refused with a message that says the code has expired | state: error |
| C2-07 | state | `busy` true, `appliedCode` null | looks | **Apply** is disabled | the control waits while a request is in flight | state: pending |
| C2-08 | state | `busy` true, `appliedCode` `LEAFY10` | looks | **Remove** is disabled | same | state: pending |
| C2-09 | accessibility | `appliedCode` null | uses the keyboard: focuses the field, types `leafy10`, presses Enter | The field’s accessible name is the visible text **Promo code**. **Apply** has an accessible name. Enter calls `onApply` with `leafy10`. | `docs/PRODUCT.md` names and keyboard only. Feature visible label. | accessibility: name and keyboard |
| C2-10 | accessibility | `appliedCode` `LEAFY10` | looks | **Remove** has an accessible name | `docs/PRODUCT.md` every button has a name | accessibility: name |
| C2-11 | accessibility | `error` `This code has expired.` | the message is rendered | The message is inside `role="alert"` or an element with `aria-live="assertive"`. Its text colour against its background is at least 4.5:1. | feature: announced to screen-reader users as soon as it appears. `docs/PRODUCT.md` contrast 4.5:1. | accessibility: live region and contrast |
| C2-12 | accessibility | `appliedCode` null | focuses the field, then **Apply**, from the keyboard | Focus is visible on the field and on **Apply** (outline is not `none` / width is not 0) | `docs/PRODUCT.md` focus is always visible | accessibility: focus |

Assert disabled with `.then(($el) => expect($el).to.be.disabled)`, not `.should('be.disabled')`.

## Out of scope

The cart page, the network, and replacing a code. Those are U1 and the API rows.
