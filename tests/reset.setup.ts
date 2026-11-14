import { test as setup, expect } from '@playwright/test';

setup('reset seed data', async ({ request }) => {
  const response = await request.post('/api/admin/reset');
  expect(response.status()).toBe(200);
});
