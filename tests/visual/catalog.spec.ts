import { expect, test } from '@playwright/test';
import { signOutInBrowser } from '../a11y/helpers/session.js';
import { BrowsePage } from '../pages/BrowsePage';

const SAVED_KEY = 'fernly_saved';

test.beforeEach(async ({ page }) => {
  await signOutInBrowser(page);
  await page.addInitScript((key) => {
    localStorage.removeItem(key);
  }, SAVED_KEY);
});

test('catalog first screen', { tag: '@visual' }, async ({ page }) => {
  const browse = new BrowsePage(page);
  await browse.open();
  await expect(browse.plantsCountHeading).toBeVisible();
  await expect(browse.firstPlantCard).toBeVisible();
  await expect(browse.firstPlantCard.getByRole('img')).toBeVisible();

  await expect(page).toHaveScreenshot('catalog-first-screen.png');
});

test('Monstera Deliciosa card (in stock)', { tag: '@visual' }, async ({ page }) => {
  const browse = new BrowsePage(page);
  const card = browse.plantCardByName('Monstera Deliciosa');

  await browse.open();
  await expect(card).toBeVisible();
  await expect(card.getByRole('img')).toBeVisible();

  await expect(card).toHaveScreenshot('monstera-deliciosa-card.png');
});

test('Hoya Carnosa card (low stock)', { tag: '@visual' }, async ({ page }) => {
  const browse = new BrowsePage(page);
  const card = browse.plantCardByName('Hoya Carnosa');

  await browse.open();
  await browse.searchPlants('Hoya Carnosa');
  await expect(browse.plantsCountHeading).toHaveText('1 plants');
  await expect(card).toBeVisible();
  await expect(card.getByRole('img')).toBeVisible();

  await expect(card).toHaveScreenshot('hoya-carnosa-card.png');
});
