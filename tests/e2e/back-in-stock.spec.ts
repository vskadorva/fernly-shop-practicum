import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { CartPage } from '../pages/CartPage';
import { LoginPage } from '../pages/LoginPage';
import { PlantPage } from '../pages/PlantPage';

/**
 * Sign-up in the browser against the real API.
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

async function notifyOutcome(plant: PlantPage): Promise<'alert' | 'confirm'> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('neither a refusal nor a confirmation appeared')), 5_000);
    const finish = (outcome: 'alert' | 'confirm') => {
      clearTimeout(timer);
      resolve(outcome);
    };
    void plant.notifyAlert
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => finish('alert'))
      .catch(() => undefined);
    void plant.backInStockConfirmation
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => finish('confirm'))
      .catch(() => undefined);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

test('E1 signs up from the plant page and refuses a bad or repeated address', { tag: '@e2e' }, async ({ page, request }) => {
  test.setTimeout(90_000);
  const plant = new PlantPage(page);

  await plant.open('pl-pilea');
  await expect(plant.plantNameHeading).toHaveText('Chinese Money Plant');
  await expect(page).not.toHaveURL(/\/login/);
  await expect(plant.notifyEmail).toBeVisible();
  await plant.focusNotifyByTabbing();
  await expect(plant.notifyEmail).toBeFocused();
  await plant.typeNotifyEmail('keys@example.com');
  await plant.pressEnter();
  await expect(plant.backInStockConfirmation).toContainText('keys@example.com');
  await expect(plant.backInStockConfirmation).toContainText('Chinese Money Plant');
  await expect(plant.notifyMeButton).toHaveCount(0);

  await plant.open('pl-pilea');
  await plant.fillNotifyEmail('Name@Example.com');
  await plant.submitNotify();
  await expect(plant.backInStockConfirmation).toContainText('Name@Example.com');
  await expect(plant.backInStockConfirmation).toContainText('Chinese Money Plant');
  await expect(plant.notifyMeButton).toHaveCount(0);

  await plant.open('pl-pilea');
  await plant.fillNotifyEmail('a@b');
  await plant.submitNotify();
  const shortOutcome = await notifyOutcome(plant);
  expect.soft(shortOutcome, 'a@b shows a refusal').toBe('alert');
  if (shortOutcome === 'alert') {
    await plant.fillNotifyEmail('fixed@example.com');
    await plant.submitNotify();
    await expect(plant.backInStockConfirmation).toContainText('fixed@example.com');
  }

  await plant.open('pl-pilea');
  await plant.fillNotifyEmail('name@');
  await plant.submitNotify();
  const trailingOutcome = await notifyOutcome(plant);
  expect.soft(trailingOutcome, 'name@ shows a refusal').toBe('alert');

  await plant.open('pl-pilea');
  await plant.fillNotifyEmail('ava@fernly.test');
  await plant.submitNotify();
  await expect(plant.backInStockConfirmation).toContainText('ava@fernly.test');

  await plant.open('pl-pilea');
  await plant.fillNotifyEmail('AVA@fernly.test');
  await plant.submitNotify();
  const duplicate = page.getByText("You're already on the list");
  await expect.soft(duplicate, 'repeat sign-up').toBeVisible();
  await expect.soft(plant.backInStockConfirmation).toHaveCount(0);

  await signIn(page, request);
  await buyOneThai(page);
  await buyOneThai(page);

  await plant.open('pl-thai');
  await expect(plant.plantNameHeading).toHaveText(THAI_NAME);
  await plant.fillNotifyEmail('ava@fernly.test');
  await plant.submitNotify();
  await expect(plant.backInStockConfirmation).toContainText('ava@fernly.test');
  await expect(plant.backInStockConfirmation).toContainText(THAI_NAME);

  await plant.open('pl-monstera');
  await expect(plant.plantNameHeading).toHaveText('Monstera Deliciosa');
  await expect(plant.notifyEmail).toHaveCount(0);
  await expect(plant.notifyMeButton).toHaveCount(0);
});
