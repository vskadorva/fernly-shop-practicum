---
name: performance-test-design
description: Designs a k6 load test from a speed requirement in Fernly's docs — a "How fast it must be" section in a feature doc, or a target in docs/PRODUCT.md. Use when the user asks for a performance, load, stress or speed test, or when a change adds or changes an API endpoint that a document gives a speed target. Writes tests/performance/<feature>.js. Do NOT use for functional API tests.
---

# Performance test design

1. Read the target in the doc: how many shoppers at once, which endpoints, which percentile and limit, how many failed requests are allowed. Quote it in a comment at the top of the script. If no document gives a target, say "assumed — ask" and use the baseline rule from tests/performance/catalog.js.

2. Follow tests/performance/catalog.js: SCENARIO smoke or load, one tag per endpoint, a check for 200, thresholds per endpoint (p95 under the doc's limit) and on failed requests, a 1-second pause per round, and handleSummary to reports/k6/<feature>-<scenario>.md and .json.

3. Load the endpoint under test together with the catalog: one slow endpoint can slow the whole shop.

4. Validate with the k6 MCP, run smoke then load, and report each endpoint's p95 against its target in a table. A breached threshold is a possible finding, with the numbers as evidence — never raise a limit to make a test pass.
