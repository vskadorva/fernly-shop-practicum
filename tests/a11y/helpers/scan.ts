import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';
import type { ImpactValue, IncompleteResult, Result, UnlabelledFrameSelector } from 'axe-core';
import {
  classifyViolationElement,
  isBlockingViolation,
  loadBaseline,
  serializeAxeTarget,
  type ClassifiedA11yElement,
} from '../baseline.js';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const;

export type AxeResultsAttachment = {
  page: string;
  url: string;
  scannedAt: string;
  violations: Result[];
  passes: Result[];
  incomplete: IncompleteResult[];
};

export type ScanPageResult = {
  classified: ClassifiedA11yElement[];
  blocking: ClassifiedA11yElement[];
};

function targetLocator(page: Page, target: UnlabelledFrameSelector) {
  const selector = serializeAxeTarget(target);
  if (!selector) return null;
  return page.locator(selector).first();
}

export async function scanPage(
  page: Page,
  testInfo: TestInfo,
  options: { name: string },
): Promise<ScanPageResult> {
  const baseline = loadBaseline();
  const axeResults = await new AxeBuilder({ page }).withTags([...AXE_TAGS]).analyze();

  const attachmentPayload: AxeResultsAttachment = {
    page: options.name,
    url: page.url(),
    scannedAt: new Date().toISOString(),
    violations: axeResults.violations,
    passes: axeResults.passes,
    incomplete: axeResults.incomplete,
  };

  await testInfo.attach('axe-results', {
    body: Buffer.from(JSON.stringify(attachmentPayload, null, 2), 'utf8'),
    contentType: 'application/json',
  });

  const shotCounts = new Map<string, number>();

  for (const violation of axeResults.violations) {
    for (const node of violation.nodes) {
      const index = shotCounts.get(violation.id) ?? 0;
      if (index < 3) {
        const locator = targetLocator(page, node.target);
        if (locator) {
          try {
            const screenshot = await locator.screenshot({ timeout: 5_000 });
            await testInfo.attach(`axe-shot:${options.name}:${violation.id}:${index}`, {
              body: screenshot,
              contentType: 'image/png',
            });
          } catch {
            // Element may be hidden or detached; skip screenshot for this node.
          }
        }
        shotCounts.set(violation.id, index + 1);
      }
    }
  }

  const classified: ClassifiedA11yElement[] = [];

  for (const violation of axeResults.violations) {
    const impact = (violation.impact ?? null) as ImpactValue;
    for (const node of violation.nodes) {
      classified.push(
        classifyViolationElement(
          options.name,
          violation.id,
          (node.impact ?? impact) as ImpactValue,
          node.target,
          node.html,
          node.failureSummary,
          baseline,
        ),
      );
    }
  }

  const blocking = classified.filter(isBlockingViolation);

  return { classified, blocking };
}
