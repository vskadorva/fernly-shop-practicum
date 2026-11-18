import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Tier = 'A' | 'B' | 'C';

export type Entry = {
  tier: Tier;
  scenario: string;
  /** The phrasing (or other Examples row) this result belongs to. */
  example: string;
  then: string;
  result: 'passed' | 'failed' | 'needs judge';
  /** Share of runs that passed, for tiers that repeat a message. */
  passRate?: number;
  evidence: string;
};

const resultsRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'helper-results');

function fileName(testTitle: string): string {
  return testTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Writes helper-results/tier-<a|b|c>/<test>.json. One file per test: Playwright
 * restarts its worker after a failure, so a list kept in memory would be lost.
 * @returns The path written.
 */
export function writeEntries(tier: Tier, testTitle: string, entries: Entry[]): string {
  const dir = join(resultsRoot, `tier-${tier.toLowerCase()}`);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${fileName(testTitle)}.json`);
  writeFileSync(path, `${JSON.stringify(entries, null, 2)}\n`);
  return path;
}
