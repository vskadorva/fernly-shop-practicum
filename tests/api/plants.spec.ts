import { expect, test } from '@playwright/test';
import { expectSchema } from '../helpers/schema';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

test('GET /api/plants/{plantId} returns a plant that matches Plant', { tag: '@api' }, async ({ request }) => {
  const response = await request.get('/api/plants/pl-monstera');
  expect(response.status()).toBe(200);
  const plant: unknown = await response.json();
  await expectSchema(request, plant, 'Plant');
});

test('GET /api/plants?sort=price-desc lists the most expensive plant first', { tag: '@api' }, async ({ request }) => {
  const response = await request.get('/api/plants', { params: { sort: 'price-desc' } });
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  if (!isRecord(body) || !Array.isArray(body.items) || body.items.length === 0) {
    throw new Error('GET /api/plants did not return a non-empty items array');
  }
  const prices = body.items.map((item) => {
    if (!isRecord(item) || typeof item.price !== 'number') {
      throw new Error('Each plant item must include a numeric price');
    }
    return item.price;
  });
  const maxPrice = Math.max(...prices);
  expect(prices[0]).toBe(maxPrice);
});
