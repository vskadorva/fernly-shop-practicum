import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { readFeature, type Example } from './feature';
import { freshCustomer, HelperPage } from './helper-page';
import { writeEntries, type Entry } from './manifest';
import {
  callOutcome,
  expectedCall,
  inRunOrder,
  runCheck,
  uiCheck,
  type CheckOutcome,
  type ExpectedCall,
} from './thens';

/**
 * Tier A: no language at all. Each distinct tool call in helper.feature is made
 * directly through window.__fernlyHelper.run, then every browser-checkable Then runs.
 * Results are written for every phrasing that expects that call.
 */

const examples = readFeature(join(dirname(fileURLToPath(import.meta.url)), 'helper.feature'));

const groups = new Map<string, { call: ExpectedCall; examples: Example[] }>();
for (const example of examples) {
  const call = example.thens.map(expectedCall).find((c) => c !== undefined);
  if (!call) continue;
  const key = `${call.name} ${JSON.stringify(call.args)}`;
  const group = groups.get(key) ?? { call, examples: [] };
  group.examples.push(example);
  groups.set(key, group);
}

type ThenOutcome = { result: Entry['result']; evidence: string };

const JUDGE: ThenOutcome = {
  result: 'needs judge',
  evidence: 'only a judge can decide this from a reply; Tier A makes no reply',
};

for (const [key, { call, examples: phrasings }] of groups) {
  test(`Tier A ${key}`, { tag: '@helper' }, async ({ page, request }) => {
    await freshCustomer(page, request);
    const helper = new HelperPage(page);
    await helper.open();
    const recorded = await helper.run(call.name, call.args);
    const called = callOutcome(call, recorded);

    const distinct = [...new Set(phrasings.flatMap((p) => p.thens))];
    const checks = inRunOrder(
      distinct.flatMap((then) => {
        const check = uiCheck(then);
        return check ? [{ then, check }] : [];
      }),
    );
    const outcomes = new Map<string, CheckOutcome>();
    for (const { then, check } of checks) {
      outcomes.set(then, await runCheck(check, { page, helper, request }));
    }

    const outcomeFor = (then: string): ThenOutcome =>
      expectedCall(then) ? called : outcomes.get(then) ?? JUDGE;

    const entries: Entry[] = phrasings.flatMap((p) =>
      p.thens.map((then) => {
        const outcome = outcomeFor(then);
        return {
          tier: 'A',
          scenario: p.scenario,
          example: p.row.phrase ?? p.when,
          then,
          result: outcome.result,
          evidence: outcome.evidence,
        };
      }),
    );
    writeEntries('A', test.info().title, entries);

    const failed = distinct
      .filter((then) => outcomeFor(then).result === 'failed')
      .map((then) => `${then} — ${outcomeFor(then).evidence}`);
    expect(failed, 'Thens that failed').toEqual([]);
  });
}
