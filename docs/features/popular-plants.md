# Feature: popular right now

Every plant page gets a short list, **Popular right now**: the plants that sold the most in the last 30 days, so a customer who is unsure can see what other people buy.

## How it should behave

- The list shows **four plants**, most popular first, each with how many **units** sold in the last 30 days ("128 sold this month"). The plant on screen is left out of its own page's list.
- Popularity is counted in **units sold, not orders**: a workshop that buys 40 cuttings in one order counts as 40.
- Only sales from the **last 30 days** count. Ties: by name, A to Z.
- **Plants that are out of stock are left out** — there's no point sending a customer to a plant they can't buy.
- `GET /api/popular?limit=N` returns up to N plants (1 to 12, default 4), each with its `unitsSold`. A limit outside 1–12 gets `400 validation_error`.

## How fast it must be

The shop expects about **20 shoppers browsing at the same time** at its busiest.

- At that load, **95% of `GET /api/popular` answers come back within 300 ms**, and **no request fails**.
- The rest of the shop keeps its speed while people browse: at the same load, **95% of catalog requests (`GET /api/plants`) still come back within 300 ms**.
