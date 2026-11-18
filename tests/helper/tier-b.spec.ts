import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { readFeature } from './feature';
import { HelperPage, newCustomer, type ToolCall } from './helper-page';
import { writeEntries, type Entry } from './manifest';
import { callOutcome, expectedCall, inRunOrder, runCheck, uiCheck, type CheckOutcome } from './thens';

/**
 * Tier B: the language is in play. Every phrasing whose Thens name a tool call is typed
 * into the real helper RUNS times, each run on a fresh page. A Then passes when it holds
 * in at least 9 of every 10 runs, as the feature doc requires.
 *
 * Each run signs in a newly registered customer instead of resetting the shop for the
 * first customer, so tests can run side by side (npm run test:helper:b). This leans on
 * docs/PRODUCT.md: only placing an order lowers stock, so other carts can't change a run.
 */

const RUNS = Number(process.env.HELPER_RUNS ?? 10);
const BAR = Math.ceil(RUNS * 0.9);
const RUN_MS = 15_000;

if (!Number.isInteger(RUNS) || RUNS < 1) throw new Error(`HELPER_RUNS must be a positive whole number, got "${process.env.HELPER_RUNS}"`);

test.describe.configure({ mode: 'parallel' });

const examples = readFeature(join(dirname(fileURLToPath(import.meta.url)), 'helper.feature'));

function describeCall(call: ToolCall | undefined): string {
  return call ? `${call.name} ${JSON.stringify(call.args)}` : 'no model call';
}

/** "runs 3, 5: <evidence>" per distinct evidence of the runs that missed. */
function misses(runs: CheckOutcome[]): string {
  const byEvidence = new Map<string, number[]>();
  runs.forEach((outcome, i) => {
    if (outcome.result !== 'failed') return;
    const evidence = outcome.evidence.replace(/\s+/g, ' ').trim();
    byEvidence.set(evidence, [...(byEvidence.get(evidence) ?? []), i + 1]);
  });
  return [...byEvidence].map(([evidence, nums]) => `run${nums.length > 1 ? 's' : ''} ${nums.join(', ')}: ${evidence}`).join(' | ');
}

function tally(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).map(([value, n]) => `${value} ×${n}`).join('; ');
}

for (const example of examples) {
  const call = example.thens.map(expectedCall).find((c) => c !== undefined);
  if (!call) continue;
  const phrase = example.row.phrase ?? example.when;

  test(`Tier B ${phrase}`, { tag: '@helper' }, async ({ browser, baseURL, request }) => {
    test.setTimeout(RUNS * RUN_MS);

    const checks = inRunOrder(
      example.thens.flatMap((then) => {
        const check = uiCheck(then);
        return check ? [{ then, check }] : [];
      }),
    );
    const outcomes = new Map<string, CheckOutcome[]>(
      example.thens.filter((then) => expectedCall(then) || uiCheck(then)).map((then) => [then, []]),
    );
    const seenCalls: string[] = [];

    for (let run = 1; run <= RUNS; run++) {
      const context = await browser.newContext({ baseURL });
      const page = await context.newPage();
      try {
        await newCustomer(page, request);
        const helper = new HelperPage(page);
        await helper.open();
        await helper.ask(phrase);

        const recorded = await helper.lastModelCall();
        seenCalls.push(describeCall(recorded));
        for (const then of example.thens.filter((t) => expectedCall(t))) {
          outcomes.get(then)?.push(callOutcome(expectedCall(then)!, recorded));
        }
        for (const { then, check } of checks) {
          outcomes.get(then)?.push(await runCheck(check, { page, helper, request }));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
        seenCalls.push(`run could not finish: ${message}`);
        for (const list of outcomes.values()) {
          while (list.length < run) list.push({ result: 'failed', evidence: `run ${run} could not finish: ${message}` });
        }
      } finally {
        await context.close();
      }
    }

    const entries: Entry[] = example.thens.map((then) => {
      const runs = outcomes.get(then);
      if (!runs) {
        return {
          tier: 'B',
          scenario: example.scenario,
          example: phrase,
          then,
          result: 'needs judge',
          evidence: 'only a judge can decide this from the reply',
        };
      }
      const passes = runs.filter((o) => o.result === 'passed').length;
      const evidence = expectedCall(then)
        ? `calls seen: ${tally(seenCalls)}`
        : passes < runs.length
          ? `misses — ${misses(runs)}`
          : `every run — last: ${runs[runs.length - 1].evidence}`;
      return {
        tier: 'B',
        scenario: example.scenario,
        example: phrase,
        then,
        result: passes >= BAR ? 'passed' : 'failed',
        passRate: `${passes}/${RUNS}`,
        evidence,
      };
    });
    writeEntries('B', test.info().title, entries);

    const failed = entries
      .filter((entry) => entry.result === 'failed')
      .map((entry) => `${entry.then} — ${entry.passRate} (needs ${BAR}/${RUNS}); ${entry.evidence}`);
    expect(failed, `Thens below ${BAR}/${RUNS}`).toEqual([]);
  });
}
