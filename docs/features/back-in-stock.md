# Feature: back in stock

Low-stock warnings on plant cards, and an email sign-up for plants that are out of stock.

## How it should behave

- A plant card shows **"Only N left"** when 1, 2 or 3 are left. With more than 3, no badge. **At 0 the card shows only "Out of stock"** — never "Only 0 left".
- The badge sits with the other tags under the plant's name. **It never covers the photo or the save button.**
- An out-of-stock plant's page shows **Email me when it's back**: an email field and a **Notify me** button. In-stock plants don't show it, and the API refuses sign-ups for them.
- No account is needed.
- **The email must be a full address** like `name@example.com`; `a@b` or `name@` are refused.
- **One sign-up per email per plant**, ignoring upper and lower case: signing up again is refused with "You're already on the list".
- After signing up, the page confirms which address will be emailed.

## API

`POST /api/plants/{plantId}/notify` with `{ "email": "…" }`. See Swagger UI.
