import { expect, test } from '@playwright/test';
import { BrowsePage } from '../pages/BrowsePage';

const MOST_EXPENSIVE_NAME =
  "Variegated Thai Constellation Monstera (Collector's Edition, Limited Greenhouse Batch)";

test('Price: high to low shows the most expensive plant first', { tag: '@e2e' }, async ({ page }) => {
  const browse = new BrowsePage(page);
  await browse.open();
  await browse.selectSort('price-desc');
  await expect(browse.plantsCountHeading).toBeVisible();
  await expect(browse.firstPlantCardHeading).toContainText(MOST_EXPENSIVE_NAME);
});
