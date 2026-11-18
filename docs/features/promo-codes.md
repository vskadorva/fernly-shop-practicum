# Feature: promo codes

Customers can type a promo code in the cart to get a discount.

## How it should behave

- The cart shows a **Promo code** field under the order summary, with an **Apply** button.
- One code per cart. Applying a new code replaces the old one. **Remove** takes it off.
- Codes ignore upper and lower case: `leafy10` works like `LEAFY10`.
- A **percentage code takes that percentage off the subtotal of the plants — never off shipping.** The discount is rounded to cents and shown as its own line: `Discount (LEAFY10) −$4.00`.
- A free-shipping code makes shipping $0.00.
- Free shipping from $50.00 is decided on the subtotal **before** the discount.
- **Expired codes are refused**, with a message that says the code has expired. Unknown codes are refused too.
- When a code is refused, the message is **announced to screen-reader users** as soon as it appears.
- The code field has a visible label.
- The order keeps the discount and the code; the cart forgets the code after the order is placed.

## Codes in the practice shop

| Code | What it gives | Valid until |
| --- | --- | --- |
| `LEAFY10` | 10% off the plants | 31 Dec 2026 |
| `FREESHIP` | Free shipping | 31 Dec 2026 |
| `SPRING5` | 5% off the plants | 30 Apr 2026 (expired) |

## API

`POST /api/cart/promo` with `{ "code": "LEAFY10" }` and `DELETE /api/cart/promo`. The cart and order responses gain `discount` and `promoCode`. See Swagger UI.
