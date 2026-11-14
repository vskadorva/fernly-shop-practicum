import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { formatBlockingViolations } from './baseline.js';
import { scanPage } from './helpers/scan.js';

/**
 * Axe on the promo field, the discount line, and an expired-code refusal.
 * Page name "Cart" keeps the existing Cart colour-contrast baseline.
 * Do not edit a11y-baseline.json. A new blocking violation fails the scan.
 */

const PASSWORD = 'Fernly-Test-2026';
const ADDRESS = {
  shippingAddress: {
    fullName: 'Aria Fern',
    address: '1 Fern Lane',
    city: 'Portland',
    postalCode: '97201',
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function register(request: APIRequestContext): Promise<{ Authorization: string; token: string }> {
  const email = `a11y-${crypto.randomUUID()}@fernly.test`;
  const response = await request.post('/api/auth/register', {
    data: { name: 'Aria Fern', email, password: PASSWORD },
  });
  expect(response.status()).toBe(201);
  const body: unknown = await response.json();
  if (!isRecord(body) || typeof body.token !== 'string') {
    throw new Error('Register did not return a token');
  }
  return { Authorization: `Bearer ${body.token}`, token: body.token };
}

async function openWithToken(page: Page, token: string, path: string): Promise<void> {
  await page.addInitScript((saved: string) => {
    localStorage.setItem('fernly_token', saved);
  }, token);
  await page.goto(path);
}

async function addPothos(request: APIRequestContext, auth: { Authorization: string }): Promise<void> {
  const response = await request.post('/api/cart/lines', {
    headers: auth,
    data: { plantId: 'pl-pothos', size: 'S', quantity: 1 },
  });
  expect(response.ok()).toBeTruthy();
}

test('X1 cart with a line and an empty promo field has no new blocking violations', { tag: '@a11y' }, async ({ page, request }, testInfo) => {
  const customer = await register(request);
  await addPothos(request, customer);
  await openWithToken(page, customer.token, '/cart');
  await expect(page.getByRole('heading', { name: 'Your cart' })).toBeVisible();

  const { blocking } = await scanPage(page, testInfo, { name: 'Cart' });
  expect.soft(blocking, formatBlockingViolations(blocking)).toHaveLength(0);
  await expect(page.getByRole('textbox', { name: 'Promo code' }), 'promo field accessible name').toBeVisible();
});

test('X1 cart with LEAFY10 applied has no new blocking violations', { tag: '@a11y' }, async ({ page, request }, testInfo) => {
  const customer = await register(request);
  await addPothos(request, customer);
  const applied = await request.post('/api/cart/promo', {
    headers: customer,
    data: { code: 'LEAFY10' },
  });
  expect(applied.ok()).toBeTruthy();

  await openWithToken(page, customer.token, '/cart');
  await expect(page.getByText(/Discount/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove', exact: true })).toBeVisible();

  const { blocking } = await scanPage(page, testInfo, { name: 'Cart' });
  expect(blocking, formatBlockingViolations(blocking)).toHaveLength(0);
});

test('X1 checkout of a discounted cart has no new blocking violations', { tag: '@a11y' }, async ({ page, request }, testInfo) => {
  const customer = await register(request);
  await addPothos(request, customer);
  const applied = await request.post('/api/cart/promo', {
    headers: customer,
    data: { code: 'LEAFY10' },
  });
  expect(applied.ok()).toBeTruthy();

  await openWithToken(page, customer.token, '/checkout');
  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
  await expect(page.getByText(/Discount/)).toBeVisible();

  const { blocking } = await scanPage(page, testInfo, { name: 'Checkout' });
  expect(blocking, formatBlockingViolations(blocking)).toHaveLength(0);
});

test('X1 a paid order with a discount line has no new blocking violations', { tag: '@a11y' }, async ({ page, request }, testInfo) => {
  const customer = await register(request);
  await addPothos(request, customer);
  const applied = await request.post('/api/cart/promo', {
    headers: customer,
    data: { code: 'LEAFY10' },
  });
  expect(applied.ok()).toBeTruthy();
  const placed = await request.post('/api/orders', { headers: customer, data: ADDRESS });
  expect(placed.status()).toBe(201);
  const order: unknown = await placed.json();
  if (!isRecord(order) || typeof order.id !== 'string') {
    throw new Error('POST /api/orders did not return an id');
  }

  await openWithToken(page, customer.token, `/orders/${order.id}`);
  await expect(page.getByRole('heading', { name: 'Paid' })).toBeVisible();
  await expect(page.getByText(/Discount/)).toBeVisible();

  const { blocking } = await scanPage(page, testInfo, { name: 'Order' });
  expect(blocking, formatBlockingViolations(blocking)).toHaveLength(0);
});

test('X1 an expired-code refusal is in an alert and the cart has no new blocking violations', { tag: '@a11y' }, async ({ page, request }, testInfo) => {
  const customer = await register(request);
  await addPothos(request, customer);
  await openWithToken(page, customer.token, '/cart');
  await expect(page.getByRole('heading', { name: 'Your cart' })).toBeVisible();

  await page.getByRole('textbox').fill('SPRING5');
  await page.getByRole('button', { name: 'Apply' }).click();

  const announced = page.locator('[role="alert"], [aria-live="assertive"]').filter({ hasText: /expired/i });
  await expect(announced, 'expired refusal is announced immediately').toBeVisible();

  const { blocking } = await scanPage(page, testInfo, { name: 'Cart' });
  expect.soft(blocking, formatBlockingViolations(blocking)).toHaveLength(0);
});
