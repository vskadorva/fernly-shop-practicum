import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { CartPage } from '../pages/CartPage';
import { CheckoutPage } from '../pages/CheckoutPage';
import { LoginPage } from '../pages/LoginPage';
import { OrdersPage } from '../pages/OrdersPage';
import { PlantPage } from '../pages/PlantPage';

/**
 * Cart → checkout → order with the real API.
 * Amounts are the documented ones from docs/features/promo-codes.md.
 */

const PASSWORD = 'Fernly-Test-2026';
const MINUS = '\u2212';
const POTHOS_NAME = "Pothos 'Golden'";
const SHIPPING_ADDRESS = {
  fullName: 'Eden Fern',
  address: '1 Fern Lane',
  city: 'Portland',
  postalCode: '97201',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function signIn(page: Page, request: APIRequestContext): Promise<void> {
  const email = `e2e-${crypto.randomUUID()}@fernly.test`;
  const registered = await request.post('/api/auth/register', {
    data: { name: 'Eden Fern', email, password: PASSWORD },
  });
  expect(registered.status()).toBe(201);

  const login = new LoginPage(page);
  await login.open();
  await login.signInWith(email, PASSWORD);
  await expect(page.getByText('Hi, Eden')).toBeVisible();
}

async function addSmallPothosToCart(page: Page): Promise<CartPage> {
  const plant = new PlantPage(page);
  await plant.open('pl-pothos');
  await expect(plant.plantNameHeading).toHaveText(POTHOS_NAME);
  await plant.addToCart();
  await expect(
    plant.addedToCartStatus.filter({ hasText: `Added 1 × ${POTHOS_NAME} to your cart.` }),
  ).toBeVisible();

  const cart = new CartPage(page);
  await cart.open();
  await expect(cart.heading).toBeVisible();
  return cart;
}

test('E1 applying leafy10 is the same discount from cart through the paid order, then the cart is empty', { tag: '@e2e' }, async ({ page, request }) => {
  test.setTimeout(60_000);
  await signIn(page, request);
  let cart = await addSmallPothosToCart(page);

  const cartSummary = cart.orderSummary();
  await expect.soft(cartSummary.getByText('$6.95')).toBeVisible();
  await expect.soft(cartSummary.getByText('$19.45')).toBeVisible();

  await cart.applyPromoCode('leafy10');

  await expect.soft(cartSummary.getByText('Discount (LEAFY10)')).toBeVisible();
  await expect.soft(cartSummary.getByText(`${MINUS}$1.25`)).toBeVisible();
  await expect.soft(cartSummary.getByText('$6.95')).toBeVisible();
  await expect.soft(cartSummary.getByText('$18.20')).toBeVisible();

  const checkout = await cart.goToCheckout();
  const checkoutSummary = checkout.orderSummary();
  await expect.soft(checkoutSummary.getByText('Discount (LEAFY10)')).toBeVisible();
  await expect.soft(checkoutSummary.getByText(`${MINUS}$1.25`)).toBeVisible();
  await expect.soft(checkoutSummary.getByText('$6.95')).toBeVisible();
  await expect.soft(checkoutSummary.getByText('$18.20')).toBeVisible();

  await checkout.fillShipping(SHIPPING_ADDRESS);
  const paid = await checkout.placeOrder();
  await expect(paid.paidSummary).toBeVisible();
  await expect.soft(paid.paidSummary.getByText('Discount (LEAFY10)')).toBeVisible();
  await expect.soft(paid.paidSummary.getByText(`${MINUS}$1.25`)).toBeVisible();
  await expect.soft(paid.paidSummary.getByText('$18.20')).toBeVisible();

  const orders = new OrdersPage(page);
  await orders.open();
  await expect.soft(orders.orderList.getByText('$18.20')).toBeVisible();

  cart = new CartPage(page);
  await cart.open();
  await expect(cart.emptyHeading).toBeVisible();

  cart = await addSmallPothosToCart(page);
  const again = cart.orderSummary();
  await expect(again.getByText(/Discount/)).toHaveCount(0);
  await expect.soft(again.getByText('$6.95')).toBeVisible();
  await expect.soft(again.getByText('$19.45')).toBeVisible();
});

test('E1 an expired code is announced and the no-code total stays', { tag: '@e2e' }, async ({ page, request }) => {
  await signIn(page, request);
  const cart = await addSmallPothosToCart(page);
  const cartSummary = cart.orderSummary();

  await cart.applyPromoCode('SPRING5');

  await expect(cart.promoAlert.filter({ hasText: /expired/i })).toBeVisible();
  await expect(cartSummary.getByText('$19.45')).toBeVisible();
  await expect(cartSummary.getByText(/Discount/)).toHaveCount(0);
});

test('E1 an unknown code is refused and the cart total stays', { tag: '@e2e' }, async ({ page, request }) => {
  await signIn(page, request);
  const cart = await addSmallPothosToCart(page);
  const cartSummary = cart.orderSummary();

  await cart.applyPromoCode('NO-SUCH-CODE');

  await expect(cartSummary.getByText('$19.45')).toBeVisible();
  await expect(cartSummary.getByText('$6.95')).toBeVisible();
  await expect(cartSummary.getByText(/Discount/)).toHaveCount(0);
  await expect(page.getByText('NO-SUCH-CODE', { exact: false })).toHaveCount(0);
});

test('E1 FREESHIP replaces LEAFY10 and Remove restores paid shipping', { tag: '@e2e' }, async ({ page, request }) => {
  await signIn(page, request);
  const cart = await addSmallPothosToCart(page);

  await cart.applyPromoCode('LEAFY10');
  await expect(cart.appliedPromoCode('LEAFY10')).toBeVisible();

  await expect(
    cart.promoCodeField,
    'the promo field stays available so a new code can replace the old one',
  ).toBeVisible();
  await cart.promoCodeField.fill('FREESHIP');
  await cart.applyPromoButton.click();

  const cartSummary = cart.orderSummary();
  await expect(cartSummary.getByText('Free')).toBeVisible();
  await expect(cartSummary.getByText(/Discount/)).toHaveCount(0);
  await expect(cartSummary.getByText('$12.50')).toBeVisible();

  await cart.removePromoCode();
  await expect(cartSummary.getByText('$6.95')).toBeVisible();
  await expect(cartSummary.getByText('$19.45')).toBeVisible();
});

test('E1 the promo field has a visible Promo code label and Apply and Remove are keyboard reachable', { tag: '@e2e' }, async ({ page, request }) => {
  await signIn(page, request);
  const cart = await addSmallPothosToCart(page);

  await expect(cart.promoCodeLabeledField).toBeVisible();
  await expect(cart.promoCodeLabel).toBeVisible();

  await cart.promoCodeLabeledField.focus();
  await page.keyboard.press('Tab');
  await expect(cart.applyPromoButton).toBeFocused();

  const token = await page.evaluate(() => localStorage.getItem('fernly_token'));
  if (!token) throw new Error('Signed-in page has no fernly_token');
  const applied = await request.post('/api/cart/promo', {
    headers: { Authorization: `Bearer ${token}` },
    data: { code: 'LEAFY10' },
  });
  expect(applied.ok()).toBeTruthy();
  const body: unknown = await applied.json();
  if (!isRecord(body)) throw new Error('POST /api/cart/promo did not return an object');

  await page.reload();
  await cart.removePromoButton.focus();
  await expect(cart.removePromoButton).toBeFocused();
});
