import { expect, type APIRequestContext, type Page } from '@playwright/test';

const TOKEN_KEY = 'fernly_token';

export function firstCustomerCredentials(): { email: string; password: string } {
  return {
    email: process.env.FERNLY_USER_EMAIL ?? 'ava@fernly.test',
    password: process.env.FERNLY_USER_PASSWORD ?? 'Fernly-Ava-2026',
  };
}

export async function signOutInBrowser(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    localStorage.removeItem(key);
  }, TOKEN_KEY);
}

export async function signInFirstCustomerWithCartLine(
  page: Page,
  request: APIRequestContext,
  plantId = 'pl-monstera',
): Promise<void> {
  const { email, password } = firstCustomerCredentials();
  const login = await request.post('/api/auth/login', { data: { email, password } });
  expect(login.ok()).toBeTruthy();
  const body = (await login.json()) as { token: string };
  const cart = await request.post('/api/cart/lines', {
    data: { plantId, size: 'S', quantity: 1 },
    headers: { Authorization: `Bearer ${body.token}` },
  });
  expect(cart.ok()).toBeTruthy();

  await page.addInitScript(({ key, token }: { key: string; token: string }) => {
    localStorage.setItem(key, token);
  }, { key: TOKEN_KEY, token: body.token });
}
