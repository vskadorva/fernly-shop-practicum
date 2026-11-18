# Feature: Fernly Helper

Every page gets a chat helper: **Ask Fernly**, bottom right. A customer types what they want, and the helper picks one of the shop's **tools**, fills in its arguments, and the shop does it — finds plants, opens a plant page, adds to the cart, or answers a care question.

In a real product a language model reads the message and picks the tool. Fernly uses a built-in stand-in that behaves like one: **the same message can now and then be understood differently.**

## The tools

| Tool | Arguments | What the customer sees |
| --- | --- | --- |
| `search_plants` | `query` (optional), `light` (`low`, `medium`, `bright`, optional), `petSafe` (optional) | The catalog with those filters |
| `open_plant` | `plantId` | That plant's page |
| `add_to_cart` | `plantId`, `size` (`S`, `M`, `L`), `quantity` (1 to 20) | That plant, in that size and quantity, in the cart — and the cart count in the header updated right away |
| `care_tip` | `plantId`, `topic` (`pets`, `light`, `care`) | A reply with the shop's own data for that plant |

## How it should behave

- **Numbers and sizes as said:** "two", "a pair of" and "2" all mean 2. "Small", "medium", "large" (or size S, M, L) pick the size; no size means Small.
- **Pet-safe, however it's said:** "pet-safe", "safe for pets", "safe for my cat", "safe for dogs" and "pet-friendly" all turn on the pet-safe filter.
- **Never claims what didn't happen:** if the shop refuses — not signed in, not enough stock — the helper says so and why. It never says "Added" for something that isn't in the cart.
- **The cart count updates right away** after the helper adds something, without reloading the page.
- **Answers come from the shop's data:** light, care level and pet safety exactly as on the plant page. Asked about a plant the shop doesn't sell, it says the shop doesn't sell it — it never invents a product or a price.
- **Reliable:** the same message leads to the right tool with the right arguments **at least 9 times out of 10**.

## For testing

- In development, `window.__fernlyHelper` lets a test skip the language part: `run(tool, args)` calls a tool directly, exactly as the helper would; `calls` lists every tool call, each with `source: 'model'` (picked by the helper) or `'direct'` (called by a test); `clear()` empties the list.
- While the helper is thinking, its message list has `aria-busy="true"`; it's `false` again when the answer is shown.
- Starting the API with `HELPER_SEED=<a number>` makes the helper's choices repeatable — useful to reproduce a miss.
