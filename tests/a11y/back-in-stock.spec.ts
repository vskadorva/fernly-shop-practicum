import { expect, test, type Page } from '@playwright/test';
import { formatBlockingViolations } from './baseline.js';
import { scanPage } from './helpers/scan.js';
import { PlantPage } from '../pages/PlantPage';
import { BrowsePage } from '../pages/BrowsePage';

/**
 * Axe on the new badge, the empty form, a confirmation, and a refusal.
 * Do not edit a11y-baseline.json. A new blocking violation fails the scan.
 */

function contrastOf(page: Page, locatorText: string) {
  return page.getByText(locatorText, { exact: true }).first().evaluate((el) => {
    function channel(value: number): number {
      const s = value / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    }
    function luminance(color: string): number {
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!match) return 0;
      const r = channel(Number(match[1]));
      const g = channel(Number(match[2]));
      const b = channel(Number(match[3]));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    let node: Element | null = el;
    let background = 'rgb(255, 255, 255)';
    while (node) {
      const bg = getComputedStyle(node).backgroundColor;
      const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (match && bg !== 'transparent' && (match[4] === undefined || Number(match[4]) > 0)) {
        background = `rgb(${match[1]}, ${match[2]}, ${match[3]})`;
        break;
      }
      node = node.parentElement;
    }
    const fg = luminance(getComputedStyle(el).color);
    const bg = luminance(background);
    const lighter = Math.max(fg, bg);
    const darker = Math.min(fg, bg);
    return (lighter + 0.05) / (darker + 0.05);
  });
}

test('X1 scans the badge, the empty form, a confirmation, and a refusal', { tag: '@a11y' }, async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const plant = new PlantPage(page);
  const browse = new BrowsePage(page);

  await plant.open('pl-pilea');
  await expect(plant.plantNameHeading).toHaveText('Chinese Money Plant');
  await expect(plant.notifyEmail, 'email field has an accessible name').toBeVisible();
  const emptyForm = await scanPage(page, testInfo, { name: 'Plant' });
  expect.soft(emptyForm.blocking, formatBlockingViolations(emptyForm.blocking)).toHaveLength(0);

  await browse.open();
  await expect(browse.plantsCountHeading).toBeVisible();
  await browse.searchPlants('String of Pearls');
  await expect(browse.onlyLeftBadge('String of Pearls', 1)).toBeVisible();
  const ratio = await contrastOf(page, 'Only 1 left');
  expect.soft(ratio, 'badge text contrast').toBeGreaterThanOrEqual(4.5);
  const badges = await scanPage(page, testInfo, { name: 'Browse' });
  expect.soft(badges.blocking, formatBlockingViolations(badges.blocking)).toHaveLength(0);

  await plant.open('pl-pilea');
  await plant.fillNotifyEmail('confirm@example.com');
  await plant.submitNotify();
  await expect(plant.backInStockConfirmation).toContainText('confirm@example.com');
  const confirmed = await scanPage(page, testInfo, { name: 'Plant' });
  expect.soft(confirmed.blocking, formatBlockingViolations(confirmed.blocking)).toHaveLength(0);

  await plant.open('pl-pilea');
  await plant.fillNotifyEmail('a@b');
  await plant.submitNotify();
  const refused = await plant.notifyAlert.isVisible().catch(() => false);
  expect.soft(refused, 'refusal is in an alert').toBe(true);
  if (refused) {
    const refusal = await scanPage(page, testInfo, { name: 'Plant' });
    expect.soft(refusal.blocking, formatBlockingViolations(refusal.blocking)).toHaveLength(0);
  }
});
