# Fernly app map

A map of the shop before testing: what each page shows, which components it is built from, and which API calls it makes.

Sources: `CHALLENGE.md`, `docs/PRODUCT.md`, the OpenAPI document at `http://localhost:8100/openapi.json` (Fernly Shop API 1.0.0), the code in `web/src/pages`, `web/src/components`, `web/src/api` and `web/src/auth`, and a walk through every page at `http://localhost:5173` on Oct 30, 2026 — signed out, then signed in as `ava@fernly.test`. One order was placed during the walk; the data was reset with `POST /api/admin/reset` afterwards.

This map describes what the app **does**. Where that may differ from `docs/PRODUCT.md`, see "Suspicions — not yet tested" in [`FINDINGS.md`](../FINDINGS.md).

## 1. Pages

Every page is rendered inside `Layout` (`web/src/pages/Layout.tsx`). The layout shows the header (Skip to content, Fernly logo, Shop, Orders when signed in, Cart with a badge, "Hi, {first name}" and Sign out, or Sign in) and the footer. When the app starts with a saved token it calls `GET /api/auth/me`. When a customer is signed in, the layout calls `GET /api/cart` for the badge. Signing out makes no API call: it deletes the `fernly_token` key from `localStorage` and drops the cached cart and order list.

The browser tab title is "Fernly — plants for every windowsill" on every page.

| Path | What it shows | API calls it makes | Its states |
| --- | --- | --- | --- |
| `/` (`BrowsePage`) | Hero, a filter sidebar (search, Low/Medium/Bright light, Pet-safe plants only, Sort by), the heading "{total} plants", a grid of `PlantCard`s (12 per page), and Previous / "Page n of m" / Next. Filters live in the URL (`?search=&light=low,bright&petSafe=true&sort=&page=`). Saved hearts are kept in `localStorage` (`fernly_saved`). | `GET /api/plants?sort={sort}&page={n}` plus `search`, `light`, `petSafe` when set | **Loading:** heading "Loading plants…" and 6 skeleton tiles. **Empty:** "No plants match your filters" / "Try another search or clear a filter." **Error:** the same "No plants match your filters" empty state, with no Try again button. **Signed out:** same as signed in. |
| `/plants/:plantId` (`PlantPage`) | Hero image, breadcrumb "Shop / {light}", name, Latin name, care badge, pet tag, light tag, rating, description, price for the chosen size, `SizePicker`, `QuantityStepper`, Add to cart, "{n} in stock", a "Likes the same light" list of up to 3 links, and a toast after adding. | `GET /api/plants/{plantId}`; `GET /api/plants?pageSize=48` (names for the "Likes the same light" links); `POST /api/cart/lines` on Add to cart | **Loading:** "Loading plant…". **Not found (404):** "We couldn't find that plant" + Back to the shop. **Other error:** banner "The plant couldn't be loaded." + Try again. **Out of stock:** both stepper buttons disabled, the button reads "Out of stock", note "Out of stock right now." **Empty:** not applicable. **Signed out:** Add to cart sends you to `/login?next=/plants/{plantId}`. |
| `/login` (`LoginPage`) | "Sign in" form: Email, Password, Sign in button, link to Create an account (keeps `next`). After success it navigates to `next` (default `/`; only values starting with `/` are used). | `POST /api/auth/login`, then `GET /api/cart` (cart is refetched) | **Busy:** button "Signing in…" and disabled. **Error:** banner with the API's `detail`. **Signed in:** the form still shows (no redirect). |
| `/register` (`RegisterPage`) | "Create an account" form: Name, Email, Password with the hint "At least 8 characters.", Create account button, link to Sign in. Navigates to `next` after success. | `POST /api/auth/register`, then `GET /api/cart` | **Busy:** "Creating…". **Error:** banner with the API's `detail`. **Signed in:** the form still shows. |
| `/cart` (`CartPage`) | "Your cart": one `CartLine` per line, `OrderSummary`, the cart-summary slot, and a "Go to checkout" link. | `GET /api/cart`; `PATCH /api/cart/lines/{lineId}` (stepper); `DELETE /api/cart/lines/{lineId}` (Remove) | **Auth not checked yet:** "Loading…". **Signed out:** redirect to `/login?next=/cart`. **Loading:** "Loading your cart…". **Error:** "Your cart couldn't be loaded." + Try again. **Empty:** "Your cart is empty" / "Plants you add will show up here." + Browse plants. **Busy:** while a change is being saved, every stepper and Remove button is disabled. **Change rejected:** error toast with the API's `detail`. |
| `/checkout` (`CheckoutPage`) | "Checkout": a "Shipping address" form (Full name, Street address, City, Postal code — all `required`, but the form has `noValidate`) with a Place order button, and `OrderSummary`. On success it navigates to `/orders/{id}?placed=1`. | `GET /api/cart`; `POST /api/orders` | **Auth not checked yet:** "Loading…". **Signed out:** redirect to `/login?next=/checkout`. **Loading:** "Loading your cart…". **Error:** "Your cart couldn't be loaded." + Try again. **Empty:** "Your cart is empty" / "Add a plant before you check out." (no link). **Submitting:** "Placing order…" and disabled. **Order rejected:** banner with the API's `detail` above the form, without Try again. |
| `/orders` (`OrdersPage`) | "Your orders": one row per order with an "Order {id}" link, the date (`en-CA`, e.g. "Oct 30, 2026"), "{n} line(s)" and the total. | `GET /api/orders` (also sent while signed out, before the redirect — it returned 401) | **Auth not checked yet:** "Loading…". **Signed out:** redirect to `/login?next=/orders`. **Loading:** "Loading your orders…". **Error:** "Your orders couldn't be loaded." + Try again. **Empty:** "No orders yet" / "Your orders will show up here." |
| `/orders/:orderId` (`OrderPage`) | "Order {id}", "Placed {date} · Ships to {full name}, {city}", one row per line ("{qty} × {name} (size {S/M/L})" and line total), and `OrderSummary` titled "Paid". With `?placed=1`, it also shows "Thank you! Your order is placed." (`role="status"`). | `GET /api/orders/{orderId}` (also sent while signed out, before the redirect — it returned 401) | **Auth not checked yet:** "Loading…". **Signed out:** redirect to `/login?next=/orders/{orderId}`. **Loading:** "Loading order…". **Not found (404):** "Order not found" + Back to your orders. **Other error:** "The order couldn't be loaded." + Try again. **Empty:** not applicable. |
| any other path | "Page not found" + Back to the shop. | none (only the layout's calls) | Static. |

## 2. Components

All in `web/src/components/`. Props are copied from each component's TypeScript interface (`?` = optional, with its default).

| Name | File | Props | What it shows | Pages that use it |
| --- | --- | --- | --- | --- |
| `PlantCard` | `PlantCard.tsx` | `PlantCardProps`: `plant: PlantSummary`; `saved?: boolean` (false); `onToggleSave?: (plantId: string) => void` | Image linking to the plant (`alt` = plant name) with an "Out of stock" overlay when `stock === 0`; a heart save button (`aria-pressed`, icon only) when `onToggleSave` is given; name as a link; Latin name; `CareLevelBadge`; `PetSafeTag`; the plant-card slot; `PriceTag` of the base price; rating "★ 4.7 out of 5". | Browse |
| `PriceTag` | `PriceTag.tsx` | `PriceTagProps`: `amount: number`; `size?: 'sm' \| 'md' \| 'lg'` ('md'); `label?: string` (read before the price by screen readers, not shown) | `formatPrice(amount)` from `web/src/money.ts`, bold green text. | Browse (via `PlantCard`), Plant, Cart (via `CartLine` and `OrderSummary`), Checkout and Order (via `OrderSummary`), Orders, Order |
| `CareLevelBadge` | `CareLevelBadge.tsx` | inline type: `level: 1 \| 2 \| 3` | One to three dots (hidden from screen readers) and "{Easy / Moderate / Expert} care"; tooltip "How much care this plant needs". | Browse (via `PlantCard`), Plant |
| `PetSafeTag` | `PetSafeTag.tsx` | inline type: `petSafe: boolean` | "🐾 Pet safe" or "⚠ Not pet safe". | Browse (via `PlantCard`), Plant |
| `SizePicker` | `SizePicker.tsx` | `SizePickerProps`: `sizes: { label: SizeLabel; priceDelta: number }[]`; `value: SizeLabel`; `onChange: (size: SizeLabel) => void`; `name?: string` ('size') | Fieldset "Size" with one radio per size: Small / Medium / Large and "Base price" or "+{formatPrice(delta)}". | Plant |
| `QuantityStepper` | `QuantityStepper.tsx` | `QuantityStepperProps`: `value: number`; `onChange: (value: number) => void`; `min?: number` (1); `max: number` (stock left); `disabled?: boolean` (false); `label?: string` ('Quantity') | Group named by `label`: "Decrease quantity" −, the value (`<output aria-live="polite">`), "Increase quantity" +. | Plant, Cart (via `CartLine`) |
| `CartLine` | `CartLine.tsx` | `CartLineProps`: `line: CartLine`; `onQuantityChange: (lineId: string, quantity: number) => void`; `onRemove: (lineId: string) => void`; `busy?: boolean` (false) | List item: image (`alt=""`), name, "Size S · $x each", `QuantityStepper` (max = `line.stock`, label "Quantity of {name}"), line total, Remove button ("Remove {name}"). | Cart |
| `OrderSummary` | `OrderSummary.tsx` | `OrderSummaryProps`: `itemCount: number`; `subtotal: number`; `shipping: number`; `total: number`; `title?: string` ('Order summary') | Section with a heading; "Subtotal (n items)", Shipping ("Free" when shipping is 0 and there are items, otherwise a price), Total; and "Add $x more for free shipping." when there are items and the subtotal is under `FREE_SHIPPING_FROM = 50`. Shows the numbers it is given; it does not compute shipping or totals. | Cart, Checkout, Order |
| `EmptyState` | `Feedback.tsx` | `EmptyStateProps`: `title: string`; `message?: string`; `action?: ReactNode` | 🌱 icon, a level-2 heading, optional message, optional action (link). | Browse, Plant, Cart, Checkout, Orders, Order, not-found route (`App.tsx`) |
| `ErrorBanner` | `Feedback.tsx` | `ErrorBannerProps`: `message: string`; `onRetry?: () => void` | `role="alert"` banner with the message and a "Try again" button when `onRetry` is given. | Plant, Cart, Checkout, Orders, Order, Login, Register |
| `Toast` | `Feedback.tsx` | `ToastProps`: `message: string`; `tone?: 'success' \| 'error'` ('success'); `onClose: () => void`; `duration?: number` (4000 ms; 0 keeps it open) | `role="status"` message with a "Dismiss" × button; closes itself after `duration`. | Plant, Cart |
| `SearchBox` | `SearchBox.tsx` | `SearchBoxProps`: `value: string`; `onSearch: (value: string) => void` | `role="search"` form: a visual "Search plants" hint (not a `<label>`), a search input, a "Clear search" × when there is text, and a Search button. Searches the trimmed text on submit only. | Browse |
| `LightFilter` | `LightFilter.tsx` | `LightFilterProps`: `value: Light[]`; `onChange: (value: Light[]) => void` | Fieldset "Light" with Low light / Medium light / Bright light checkboxes. | Browse |
| `SortSelect` | `SortSelect.tsx` | `SortSelectProps`: `value: Sort`; `onChange: (value: Sort) => void` | "Sort by" select: Featured, Price: low to high, Price: high to low, Name: A to Z, Best rated. | Browse |

Feature slots (`web/src/slots/Slot.tsx`) are not in `components/` but render inside these pages: `PlantPageSlot { plant: Plant }` on the plant page, `PlantCardSlot { plant: PlantSummary }` inside `PlantCard`, and `CartSummarySlot { cart: Cart }` on the cart page. The slot folders are empty today, so they render nothing.

## 3. API

From `openapi.json`. "Needs sign-in" means the operation declares `bearer` security (a token from login or register in `Authorization: Bearer …`). There is no sign-out endpoint.

| Method and path | Used by which page | Needs sign-in? |
| --- | --- | --- |
| `GET /api/health` | none (for tests and `npm run smoke`) | No |
| `POST /api/admin/reset` | none (for tests; README) | No |
| `GET /api/plants` | Browse (search, light, petSafe, sort, page); Plant (`pageSize=48`, for the "Likes the same light" names) | No |
| `GET /api/plants/{plantId}` | Plant | No |
| `POST /api/auth/register` | Register | No |
| `POST /api/auth/login` | Login | No |
| `GET /api/auth/me` | every page, once when the app starts with a saved token (`AuthProvider`) | Yes |
| `GET /api/cart` | every page while signed in (header badge, `Layout`); Cart; Checkout | Yes |
| `POST /api/cart/lines` | Plant (Add to cart) | Yes |
| `PATCH /api/cart/lines/{lineId}` | Cart (quantity stepper on a line) | Yes |
| `DELETE /api/cart/lines/{lineId}` | Cart (Remove) | Yes |
| `POST /api/orders` | Checkout (Place order) | Yes |
| `GET /api/orders` | Orders | Yes |
| `GET /api/orders/{orderId}` | Order | Yes |

Contract details that matter for testing:

- Errors are `{ "detail": "...", "rule": "..." }`; the rules are `validation_error`, `auth_required`, `invalid_credentials`, `email_taken`, `stock_limit`, `empty_cart`. A 404 has no `rule`.
- Every money field (`price`, `priceDelta`, `unitPrice`, `lineTotal`, `subtotal`, `shipping`, `total`) is "Dollars, two decimals."
- `careLevel` is an integer 1–3: "1 Easy, 2 Moderate, 3 Expert."
- `GET /api/plants`: `page` ≥ 1; `pageSize` 1–48, default 12; `sort` is one of `featured`, `price-asc` (lowest first), `price-desc` (highest first), `name` (A–Z), `rating` (highest first).
- `POST /api/cart/lines` and `PATCH /api/cart/lines/{lineId}`: `quantity` 1–20; a line can never exceed the plant's stock (`stock_limit`).
- `GET /api/cart`: shipping is 6.95, free when the subtotal is 50.00 or more, none for an empty cart.
- `POST /api/orders`: `fullName`, `address`, `city` at least 1 character, `postalCode` at least 3. It charges the cart as it is, lowers stock, and empties the cart.
- `GET /api/orders` returns orders newest first; `GET /api/orders/{orderId}` returns 404 to anyone who didn't place the order.
- Register: `password` at least 8 characters; `email` in email format.

## Test data seen on the walk

- 21 plants: page 1 has 12, page 2 has 9.
- Boundary plants: `pl-bird` Bird of Paradise at exactly $50 (the free-shipping line); `pl-cutting` Succulent Cutting at $0.99; `pl-thai` at $189, with a very long name ("Variegated Thai Constellation Monstera (Collector's Edition, Limited Greenhouse Batch)"); `pl-pilea` Chinese Money Plant out of stock (Small and Medium sizes only); `pl-snake` Snake Plant with 20 in stock (the same as the API's quantity maximum).
- Care level 3 plants (three dots): Fiddle Leaf Fig, Calathea Orbifolia, String of Pearls.
- Ava's cart and order list start empty.
