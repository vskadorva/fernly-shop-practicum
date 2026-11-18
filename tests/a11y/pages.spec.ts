import { expect, test } from '@playwright/test';
import { formatBlockingViolations } from './baseline.js';
import { scanPage } from './helpers/scan.js';
import { signInFirstCustomerWithCartLine, signOutInBrowser } from './helpers/session.js';

test('Browse', { tag: '@a11y' }, async ({ page }, testInfo) => {
  await signOutInBrowser(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: /\d+ plants/ })).toBeVisible();

  const { blocking } = await scanPage(page, testInfo, { name: 'Browse' });
  expect(blocking, formatBlockingViolations(blocking)).toHaveLength(0);
});

test('Plant', { tag: '@a11y' }, async ({ page }, testInfo) => {
  await signOutInBrowser(page);
  await page.goto('/plants/pl-monstera');
  await expect(page.getByRole('heading', { level: 1, name: 'Monstera Deliciosa' })).toBeVisible();

  const { blocking } = await scanPage(page, testInfo, { name: 'Plant' });
  expect(blocking, formatBlockingViolations(blocking)).toHaveLength(0);
});

test('Sign in', { tag: '@a11y' }, async ({ page }, testInfo) => {
  await signOutInBrowser(page);
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  const { blocking } = await scanPage(page, testInfo, { name: 'Sign in' });
  expect(blocking, formatBlockingViolations(blocking)).toHaveLength(0);
});

test('Cart', { tag: '@a11y' }, async ({ page, request }, testInfo) => {
  await signInFirstCustomerWithCartLine(page, request);
  await page.goto('/cart');
  await expect(page.getByRole('heading', { name: 'Your cart' })).toBeVisible();

  const { blocking } = await scanPage(page, testInfo, { name: 'Cart' });
  expect(blocking, formatBlockingViolations(blocking)).toHaveLength(0);
});

test('Checkout', { tag: '@a11y' }, async ({ page, request }, testInfo) => {
  await signInFirstCustomerWithCartLine(page, request);
  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();

  const { blocking } = await scanPage(page, testInfo, { name: 'Checkout' });
  expect(blocking, formatBlockingViolations(blocking)).toHaveLength(0);
});
