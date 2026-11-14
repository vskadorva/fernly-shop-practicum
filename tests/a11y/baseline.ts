import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ImpactValue, UnlabelledFrameSelector } from 'axe-core';

export type BaselineEntry = {
  rule: string;
  page: string;
  /** CSS selector, or `*` for every element on the page for that rule. */
  target: string;
  owner: string;
  expires: string;
  reason: string;
};

export type ViolationClassification = 'new' | 'baselined' | 'expired';

export type ClassifiedA11yElement = {
  rule: string;
  page: string;
  impact: ImpactValue;
  target: UnlabelledFrameSelector;
  targetSelector: string;
  html: string;
  failureSummary?: string;
  classification: ViolationClassification;
  baseline?: BaselineEntry;
};

const baselinePath = join(dirname(fileURLToPath(import.meta.url)), 'a11y-baseline.json');

let cachedBaseline: BaselineEntry[] | null = null;

export function loadBaselineFrom(filePath: string): BaselineEntry[] {
  const raw = readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as BaselineEntry[];
}

export function loadBaseline(): BaselineEntry[] {
  if (cachedBaseline) return cachedBaseline;
  cachedBaseline = loadBaselineFrom(baselinePath);
  return cachedBaseline;
}

export function baselineEntryKey(entry: BaselineEntry): string {
  return `${entry.page}\0${entry.rule}\0${entry.target}\0${entry.owner}\0${entry.expires}`;
}

export function serializeAxeTarget(target: UnlabelledFrameSelector): string {
  return target
    .filter((segment): segment is string => typeof segment === 'string')
    .join(' ');
}

function parseDateOnly(isoDate: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    throw new Error(`Invalid baseline expires date (expected YYYY-MM-DD): ${isoDate}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(Date.UTC(year, month - 1, day));
}

function utcToday(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function isBaselineExpired(expires: string, now = new Date()): boolean {
  return utcToday(now).getTime() > parseDateOnly(expires).getTime();
}

function targetMatches(baselineTarget: string, axeTarget: UnlabelledFrameSelector): boolean {
  if (baselineTarget === '*') return true;
  const parts = axeTarget.filter((segment): segment is string => typeof segment === 'string');
  const joined = parts.join(' ');
  return joined === baselineTarget || parts.includes(baselineTarget) || parts.at(-1) === baselineTarget;
}

function findMatchingBaseline(
  page: string,
  rule: string,
  axeTarget: UnlabelledFrameSelector,
  entries: BaselineEntry[],
): BaselineEntry | undefined {
  return entries.find(
    (entry) => entry.page === page && entry.rule === rule && targetMatches(entry.target, axeTarget),
  );
}

export function classifyViolationElement(
  page: string,
  rule: string,
  impact: ImpactValue,
  target: UnlabelledFrameSelector,
  html: string,
  failureSummary: string | undefined,
  entries: BaselineEntry[],
  now = new Date(),
): ClassifiedA11yElement {
  const match = findMatchingBaseline(page, rule, target, entries);
  if (!match) {
    return {
      rule,
      page,
      impact,
      target,
      targetSelector: serializeAxeTarget(target),
      html,
      failureSummary,
      classification: 'new',
    };
  }
  const classification: ViolationClassification = isBaselineExpired(match.expires, now) ? 'expired' : 'baselined';
  return {
    rule,
    page,
    impact,
    target,
    targetSelector: serializeAxeTarget(target),
    html,
    failureSummary,
    classification,
    baseline: match,
  };
}

export function isBlockingViolation(element: ClassifiedA11yElement): boolean {
  if (element.classification === 'expired') return true;
  if (element.classification === 'new' && (element.impact === 'serious' || element.impact === 'critical')) {
    return true;
  }
  return false;
}

export function formatBlockingViolations(blocking: ClassifiedA11yElement[]): string {
  if (blocking.length === 0) return 'No blocking accessibility violations.';
  return blocking
    .map((item) => {
      const parts = [
        `[${item.classification}] ${item.rule}`,
        `impact=${item.impact ?? 'unknown'}`,
        `target=${item.targetSelector}`,
      ];
      if (item.failureSummary) parts.push(item.failureSummary.trim());
      if (item.baseline) {
        parts.push(`baseline expires ${item.baseline.expires} (${item.baseline.reason})`);
      }
      return parts.join(' — ');
    })
    .join('\n');
}
