import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { CartPage } from '../pages/CartPage';
import { LoginPage } from '../pages/LoginPage';
import { BrowsePage } from '../pages/BrowsePage';
import { PlantPage } from '../pages/PlantPage';

/**
 * Browse badges follow stock, including after a purchase.
 * Expectations are from docs/features/back-in-stock.md.
 */

const PASSWORD = 'Fernly-Test-2026';
const SHIPPING = {
  fullName: 'Nia Fern',
  address: '1 Fern Lane',
  city: 'Portland',
  postalCode: '97201',
};
const THAI_NAME =
  "Variegated Thai Constellation Monstera (Collector's Edition, Limited Greenhouse Batch)";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function overlaps(
  a: { x: number; y: number; width: number; height: number } | null,
  b: { x: number; y: number; width: number; height: number } | null,
): boolean {
  if (!a || !b) return false;
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

async function signIn(page: Page, request: APIRequestContext): Promise<void> {
  const email = `e2e-${crypto.randomUUID()}@fernly.test`;
  const registered = await request.post('/api/auth/register', {
    data: { name: 'Nia Fern', email, password: PASSWORD },
  });
  expect(registered.status()).toBe(201);
  const body: unknown = await registered.json();
  if (!isRecord(body) || typeof body.token !== 'string') {
    throw new Error('Register did not return a token');
  }
  const login = new LoginPage(page);
  await login.open();
  await login.signInWith(email, PASSWORD);
  await expect(page.getByText('Hi, Nia')).toBeVisible();
}

async function buyOneThai(page: Page): Promise<void> {
  const plant = new PlantPage(page);
  await plant.open('pl-thai');
  await expect(plant.plantNameHeading).toHaveText(THAI_NAME);
  await plant.addToCart();
  await expect(plant.addedToCartStatus.filter({ hasText: `Added 1 × ${THAI_NAME} to your cart.` })).toBeVisible();
  const cart = new CartPage(page);
  await cart.open();
  const checkout = await cart.goToCheckout();
  await checkout.fillShipping(SHIPPING);
  const paid = await checkout.placeOrder();
  await expect(paid.paidSummary).toBeVisible();
}

async function expectBadgeClearsChrome(browse: BrowsePage, name: string): Promise<void> {
  const badge = browse.anyOnlyLeftBadge(name);
  const photo = browse.cardPhoto(name);
  const save = browse.cardSaveButton(name);
  await expect(badge).toBeVisible();
  await expect(save).toHaveAttribute('aria-pressed', /true|false/);
  const coveredPhoto = overlaps(await badge.boundingBox(), await photo.boundingBox());
  const coveredSave = overlaps(await badge.boundingBox(), await save.boundingBox());
  expect.soft(coveredPhoto, `${name} badge covers the photo`).toBe(false);
  expect.soft(coveredSave, `${name} badge covers the save button`).toBe(false);
  if (!coveredSave) {
    await save.click();
    await expect(save).toHaveAttribute('aria-pressed', 'true');
  }
}

test('E2 shows low-stock badges that follow a purchase and never cover Save', { tag: '@e2e' }, async ({ page, request }) => {
  test.setTimeout(120_000);
  const browse = new BrowsePage(page);
  const plant = new PlantPage(page);

  await page.setViewportSize({ width: 1280, height: 800 });
  await browse.open();
  await browse.searchPlants('String of Pearls');
  await expect(browse.plantsCountHeading).toHaveText('1 plants');
  await expect(browse.onlyLeftBadge('String of Pearls', 1)).toBeVisible();
  await expectBadgeClearsChrome(browse, 'String of Pearls');

  await browse.searchPlants('Thai Constellation');
  await expect(browse.onlyLeftBadge(THAI_NAME, 2)).toBeVisible();
  await expectBadgeClearsChrome(browse, THAI_NAME);

  await browse.searchPlants('Hoya Carnosa');
  await expect(browse.onlyLeftBadge('Hoya Carnosa', 3)).toBeVisible();
  await expectBadgeClearsChrome(browse, 'Hoya Carnosa');

  await browse.searchPlants('Fiddle Leaf Fig');
  await expect(browse.anyOnlyLeftBadge('Fiddle Leaf Fig')).toHaveCount(0);

  await browse.searchPlants('Monstera Deliciosa');
  await expect(browse.anyOnlyLeftBadge('Monstera Deliciosa')).toHaveCount(0);

  await browse.searchPlants('Chinese Money Plant');
  await expect(browse.outOfStockLabel('Chinese Money Plant')).toBeVisible();
  await expect.soft(browse.anyOnlyLeftBadge('Chinese Money Plant')).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await browse.searchPlants('String of Pearls');
  await expectBadgeClearsChrome(browse, 'String of Pearls');
  await browse.searchPlants('Hoya Carnosa');
  await expectBadgeClearsChrome(browse, 'Hoya Carnosa');

  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, request);
  await buyOneThai(page);

  await browse.open();
  await browse.searchPlants('Thai Constellation');
  await expect(browse.onlyLeftBadge(THAI_NAME, 1)).toBeVisible();

  await buyOneThai(page);
  await browse.open();
  await browse.searchPlants('Thai Constellation');
  await expect(browse.outOfStockLabel(THAI_NAME)).toBeVisible();
  await expect.soft(browse.anyOnlyLeftBadge(THAI_NAME)).toHaveCount(0);

  await plant.open('pl-thai');
  await expect(plant.notifyEmail).toBeVisible();
  await expect(plant.notifyMeButton).toBeVisible();
});
