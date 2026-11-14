import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import { expectSchema } from '../helpers/schema';

/**
 * Promo codes against the documented cart and order rules.
 * Expectations are from docs/features/promo-codes.md, docs/PRODUCT.md, and OpenAPI.
 * A mismatch with the running API is a failure to keep, not an assertion to edit.
 */

const ADDRESS = {
  shippingAddress: {
    fullName: 'Ava Green',
    address: '1 Fern Lane',
    city: 'Portland',
    postalCode: '97201',
  },
};

interface CartBody {
  lines: { id: string }[];
  itemCount: number;
  subtotal: number;
  discount: number;
  promoCode: string | null;
  shipping: number;
  total: number;
}

interface OrderBody {
  id: string;
  subtotal: number;
  discount: number;
  promoCode: string | null;
  shipping: number;
  total: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectMoney(actual: unknown, expected: number, label: string): void {
  expect(typeof actual, `${label} is a number`).toBe('number');
  const actualCents = Math.round((actual as number) * 100);
  const expectedCents = Math.round(expected * 100);
  expect(actualCents, `${label}: expected ${expected}, got ${String(actual)}`).toBe(expectedCents);
}

function parseCart(body: unknown): CartBody {
  if (!isRecord(body) || !Array.isArray(body.lines)) {
    throw new Error(`Expected a cart, received ${JSON.stringify(body)}`);
  }
  const lineIds = body.lines.map((line) => {
    if (!isRecord(line) || typeof line.id !== 'string') {
      throw new Error(`Cart line is missing an id: ${JSON.stringify(line)}`);
    }
    return { id: line.id };
  });
  if (typeof body.itemCount !== 'number' || typeof body.subtotal !== 'number') {
    throw new Error(`Cart is missing itemCount or subtotal: ${JSON.stringify(body)}`);
  }
  if (typeof body.discount !== 'number' || typeof body.shipping !== 'number' || typeof body.total !== 'number') {
    throw new Error(`Cart is missing money fields: ${JSON.stringify(body)}`);
  }
  if (body.promoCode !== null && typeof body.promoCode !== 'string') {
    throw new Error(`Cart promoCode must be a string or null: ${JSON.stringify(body.promoCode)}`);
  }
  return {
    lines: lineIds,
    itemCount: body.itemCount,
    subtotal: body.subtotal,
    discount: body.discount,
    promoCode: body.promoCode,
    shipping: body.shipping,
    total: body.total,
  };
}

function parseOrder(body: unknown): OrderBody {
  if (!isRecord(body) || typeof body.id !== 'string') {
    throw new Error(`Expected an order, received ${JSON.stringify(body)}`);
  }
  if (typeof body.subtotal !== 'number' || typeof body.discount !== 'number') {
    throw new Error(`Order is missing money fields: ${JSON.stringify(body)}`);
  }
  if (typeof body.shipping !== 'number' || typeof body.total !== 'number') {
    throw new Error(`Order is missing shipping or total: ${JSON.stringify(body)}`);
  }
  if (body.promoCode !== null && typeof body.promoCode !== 'string') {
    throw new Error(`Order promoCode must be a string or null: ${JSON.stringify(body.promoCode)}`);
  }
  return {
    id: body.id,
    subtotal: body.subtotal,
    discount: body.discount,
    promoCode: body.promoCode,
    shipping: body.shipping,
    total: body.total,
  };
}

function assertCart(cart: CartBody, expected: Partial<CartBody> & Pick<CartBody, 'discount' | 'promoCode' | 'shipping' | 'total'>): void {
  if (expected.subtotal !== undefined) expectMoney(cart.subtotal, expected.subtotal, 'subtotal');
  expectMoney(cart.discount, expected.discount, 'discount');
  expect(cart.promoCode, 'promoCode').toBe(expected.promoCode);
  expectMoney(cart.shipping, expected.shipping, 'shipping');
  expectMoney(cart.total, expected.total, 'total');
}

function assertOrder(order: OrderBody, expected: Omit<OrderBody, 'id'>): void {
  expectMoney(order.subtotal, expected.subtotal, 'subtotal');
  expectMoney(order.discount, expected.discount, 'discount');
  expect(order.promoCode, 'promoCode').toBe(expected.promoCode);
  expectMoney(order.shipping, expected.shipping, 'shipping');
  expectMoney(order.total, expected.total, 'total');
}

async function jsonBody(response: APIResponse): Promise<unknown> {
  return response.json() as Promise<unknown>;
}

async function register(request: APIRequestContext): Promise<{ Authorization: string }> {
  const email = `promo-${crypto.randomUUID()}@fernly.test`;
  const response = await request.post('/api/auth/register', {
    data: { name: 'Promo Tester', email, password: 'Fernly-Test-2026' },
  });
  expect(response.status(), 'register').toBe(201);
  const body = await jsonBody(response);
  if (!isRecord(body) || typeof body.token !== 'string') {
    throw new Error('Register did not return a token');
  }
  return { Authorization: `Bearer ${body.token}` };
}

async function login(request: APIRequestContext, email: string, password: string): Promise<{ Authorization: string }> {
  const response = await request.post('/api/auth/login', { data: { email, password } });
  expect(response.status(), `login ${email}`).toBe(200);
  const body = await jsonBody(response);
  if (!isRecord(body) || typeof body.token !== 'string') {
    throw new Error(`Login for ${email} did not return a token`);
  }
  return { Authorization: `Bearer ${body.token}` };
}

async function addPlant(
  request: APIRequestContext,
  auth: { Authorization: string },
  plantId: string,
  quantity = 1,
): Promise<CartBody> {
  const response = await request.post('/api/cart/lines', {
    headers: auth,
    data: { plantId, size: 'S', quantity },
  });
  expect(response.status(), `add ${plantId}`).toBe(200);
  const body = await jsonBody(response);
  await expectSchema(request, body, 'Cart');
  return parseCart(body);
}

async function applyCode(
  request: APIRequestContext,
  auth: { Authorization: string },
  code: string,
): Promise<{ status: number; body: unknown }> {
  const response = await request.post('/api/cart/promo', { headers: auth, data: { code } });
  const body = await jsonBody(response);
  return { status: response.status(), body };
}

async function getCart(request: APIRequestContext, auth: { Authorization: string }): Promise<CartBody> {
  const response = await request.get('/api/cart', { headers: auth });
  expect(response.status(), 'GET /api/cart').toBe(200);
  const body = await jsonBody(response);
  await expectSchema(request, body, 'Cart');
  return parseCart(body);
}

const POTHOS_LEAFY = { subtotal: 12.5, discount: 1.25, promoCode: 'LEAFY10', shipping: 6.95, total: 18.2 };
const POTHOS_FREE = { subtotal: 12.5, discount: 0, promoCode: 'FREESHIP', shipping: 0, total: 12.5 };
const POTHOS_NONE = { subtotal: 12.5, discount: 0, promoCode: null, shipping: 6.95, total: 19.45 };

test('M1 LEAFY10 takes 10% off one Small Pothos and leaves shipping at $6.95', { tag: '@api' }, async ({ request }) => {
  const auth = await register(request);
  await addPlant(request, auth, 'pl-pothos');
  const applied = await applyCode(request, auth, 'LEAFY10');
  expect(applied.status).toBe(200);
  await expectSchema(request, applied.body, 'Cart');
  assertCart(parseCart(applied.body), POTHOS_LEAFY);
});

test('M1 rounds 10% of a $0.99 cutting to the nearest cent', { tag: '@api' }, async ({ request }) => {
  const auth = await register(request);
  await addPlant(request, auth, 'pl-cutting');
  const applied = await applyCode(request, auth, 'LEAFY10');
  expect(applied.status).toBe(200);
  await expectSchema(request, applied.body, 'Cart');
  assertCart(parseCart(applied.body), {
    subtotal: 0.99,
    discount: 0.1,
    promoCode: 'LEAFY10',
    shipping: 6.95,
    total: 7.84,
  });
});

test('M1 does not take 10% off shipping on a $49.00 fiddle', { tag: '@api' }, async ({ request }) => {
  const auth = await register(request);
  await addPlant(request, auth, 'pl-fiddle');
  const applied = await applyCode(request, auth, 'LEAFY10');
  expect(applied.status).toBe(200);
  await expectSchema(request, applied.body, 'Cart');
  assertCart(parseCart(applied.body), {
    subtotal: 49,
    discount: 4.9,
    promoCode: 'LEAFY10',
    shipping: 6.95,
    total: 51.05,
  });
});

test('M1 recomputes the discount when the line quantity changes', { tag: '@api' }, async ({ request }) => {
  const auth = await register(request);
  const added = await addPlant(request, auth, 'pl-pothos');
  const applied = await applyCode(request, auth, 'LEAFY10');
  expect(applied.status).toBe(200);
  const updated = await request.patch(`/api/cart/lines/${added.lines[0].id}`, {
    headers: auth,
    data: { quantity: 2 },
  });
  expect(updated.status()).toBe(200);
  const body = await jsonBody(updated);
  await expectSchema(request, body, 'Cart');
  assertCart(parseCart(body), {
    subtotal: 25,
    discount: 2.5,
    promoCode: 'LEAFY10',
    shipping: 6.95,
    total: 29.45,
  });
});

test('M2 FREESHIP sets shipping to $0.00 and does not discount plants', { tag: '@api' }, async ({ request }) => {
  const auth = await register(request);
  await addPlant(request, auth, 'pl-pothos');
  const applied = await applyCode(request, auth, 'FREESHIP');
  expect(applied.status).toBe(200);
  await expectSchema(request, applied.body, 'Cart');
  assertCart(parseCart(applied.body), POTHOS_FREE);
});

test('M2 FREESHIP on a $50.00 cart keeps shipping at $0.00 and discount at 0', { tag: '@api' }, async ({ request }) => {
  const auth = await register(request);
  await addPlant(request, auth, 'pl-bird');
  const applied = await applyCode(request, auth, 'FREESHIP');
  expect(applied.status).toBe(200);
  await expectSchema(request, applied.body, 'Cart');
  assertCart(parseCart(applied.body), {
    subtotal: 50,
    discount: 0,
    promoCode: 'FREESHIP',
    shipping: 0,
    total: 50,
  });
});

test('M3 a $50.00 subtotal stays free to ship after LEAFY10', { tag: '@api' }, async ({ request }) => {
  const auth = await register(request);
  await addPlant(request, auth, 'pl-bird');
  const applied = await applyCode(request, auth, 'LEAFY10');
  expect(applied.status).toBe(200);
  await expectSchema(request, applied.body, 'Cart');
  assertCart(parseCart(applied.body), {
    subtotal: 50,
    discount: 5,
    promoCode: 'LEAFY10',
    shipping: 0,
    total: 45,
  });
});

test('M3 a $49.00 subtotal still pays shipping after LEAFY10', { tag: '@api' }, async ({ request }) => {
  const auth = await register(request);
  await addPlant(request, auth, 'pl-fiddle');
  const applied = await applyCode(request, auth, 'LEAFY10');
  expect(applied.status).toBe(200);
  const cart = parseCart(applied.body);
  expectMoney(cart.shipping, 6.95, 'shipping');
});

test('M4 the order keeps LEAFY10 and the cart forgets it', { tag: '@api' }, async ({ request }) => {
  const auth = await register(request);
  await addPlant(request, auth, 'pl-pothos');
  const applied = await applyCode(request, auth, 'LEAFY10');
  expect(applied.status).toBe(200);

  const placed = await request.post('/api/orders', { headers: auth, data: ADDRESS });
  expect(placed.status()).toBe(201);
  const placedBody = await jsonBody(placed);
  await expectSchema(request, placedBody, 'Order');
  const order = parseOrder(placedBody);
  assertOrder(order, POTHOS_LEAFY);

  const fetched = await request.get(`/api/orders/${order.id}`, { headers: auth });
  expect(fetched.status()).toBe(200);
  const fetchedBody = await jsonBody(fetched);
  await expectSchema(request, fetchedBody, 'Order');
  assertOrder(parseOrder(fetchedBody), POTHOS_LEAFY);

  const cart = await getCart(request, auth);
  expect(cart.lines, 'cart lines after the order').toEqual([]);
  assertCart(cart, { discount: 0, promoCode: null, shipping: 0, total: 0, subtotal: 0 });
});

test('M4 the order keeps FREESHIP and the cart forgets it', { tag: '@api' }, async ({ request }) => {
  const auth = await register(request);
  await addPlant(request, auth, 'pl-pothos');
  const applied = await applyCode(request, auth, 'FREESHIP');
  expect(applied.status).toBe(200);

  const placed = await request.post('/api/orders', { headers: auth, data: ADDRESS });
  expect(placed.status()).toBe(201);
  const placedBody = await jsonBody(placed);
  await expectSchema(request, placedBody, 'Order');
  const order = parseOrder(placedBody);
  assertOrder(order, POTHOS_FREE);

  const cart = await getCart(request, auth);
  expect(cart.promoCode, 'cart promo after FREESHIP order').toBeNull();
  expectMoney(cart.discount, 0, 'discount');
});

test('SCH1 cart routes return a Cart, and a cart with no code follows the shipping rule', { tag: '@api' }, async ({ request }) => {
  const auth = await register(request);

  const empty = await getCart(request, auth);
  assertCart(empty, { subtotal: 0, discount: 0, promoCode: null, shipping: 0, total: 0 });

  const pothos = await addPlant(request, auth, 'pl-pothos');
  assertCart(pothos, POTHOS_NONE);

  const patched = await request.patch(`/api/cart/lines/${pothos.lines[0].id}`, {
    headers: auth,
    data: { quantity: 2 },
  });
  expect(patched.status()).toBe(200);
  const patchedBody = await jsonBody(patched);
  await expectSchema(request, patchedBody, 'Cart');

  const removed = await request.delete(`/api/cart/lines/${pothos.lines[0].id}`, { headers: auth });
  expect(removed.status()).toBe(200);
  const removedBody = await jsonBody(removed);
  await expectSchema(request, removedBody, 'Cart');
  assertCart(parseCart(removedBody), { discount: 0, promoCode: null, shipping: 0, total: 0 });

  await addPlant(request, auth, 'pl-pothos');
  const withCode = await applyCode(request, auth, 'LEAFY10');
  expect(withCode.status).toBe(200);
  await expectSchema(request, withCode.body, 'Cart');

  const cleared = await request.delete('/api/cart/promo', { headers: auth });
  expect(cleared.status()).toBe(200);
  const clearedBody = await jsonBody(cleared);
  await expectSchema(request, clearedBody, 'Cart');
  assertCart(parseCart(clearedBody), POTHOS_NONE);
});

test('SCH1 a $50.00 Bird of Paradise with no code ships free', { tag: '@api' }, async ({ request }) => {
  const auth = await register(request);
  const bird = await addPlant(request, auth, 'pl-bird');
  assertCart(bird, { subtotal: 50, discount: 0, promoCode: null, shipping: 0, total: 50 });
});

test('SCH1 order routes return an Order, including the list after a discounted checkout', { tag: '@api' }, async ({ request }) => {
  const auth = await register(request);
  await addPlant(request, auth, 'pl-pothos');
  const applied = await applyCode(request, auth, 'LEAFY10');
  expect(applied.status).toBe(200);

  const placed = await request.post('/api/orders', { headers: auth, data: ADDRESS });
  expect(placed.status()).toBe(201);
  const placedBody = await jsonBody(placed);
  await expectSchema(request, placedBody, 'Order');
  const order = parseOrder(placedBody);
  assertOrder(order, POTHOS_LEAFY);

  const one = await request.get(`/api/orders/${order.id}`, { headers: auth });
  expect(one.status()).toBe(200);
  await expectSchema(request, await jsonBody(one), 'Order');

  const list = await request.get('/api/orders', { headers: auth });
  expect(list.status()).toBe(200);
  const listBody = await jsonBody(list);
  await expectSchema(request, listBody, 'OrderList');
  if (!Array.isArray(listBody)) throw new Error('GET /api/orders did not return an array');
  expect(listBody.length).toBeGreaterThan(0);
  const match = listBody.find((entry) => isRecord(entry) && entry.id === order.id);
  if (!isRecord(match)) throw new Error(`Order ${order.id} is missing from GET /api/orders`);
  await expectSchema(request, match, 'Order');
  assertOrder(parseOrder(match), POTHOS_LEAFY);
});

test('P1 another customer cannot see the code or the discounted order', { tag: '@api' }, async ({ request }) => {
  const ava = await login(
    request,
    process.env.FERNLY_USER_EMAIL ?? 'ava@fernly.test',
    process.env.FERNLY_USER_PASSWORD ?? 'Fernly-Ava-2026',
  );
  const ben = await login(
    request,
    process.env.FERNLY_ALT_USER_EMAIL ?? 'ben@fernly.test',
    process.env.FERNLY_ALT_USER_PASSWORD ?? 'Fernly-Ben-2026',
  );

  await addPlant(request, ava, 'pl-pothos');
  const applied = await applyCode(request, ava, 'LEAFY10');
  expect(applied.status).toBe(200);

  const benCart = await getCart(request, ben);
  expect(benCart.promoCode, "Ben's cart promoCode").toBeNull();
  expectMoney(benCart.discount, 0, "Ben's discount");

  const placed = await request.post('/api/orders', { headers: ava, data: ADDRESS });
  expect(placed.status()).toBe(201);
  const order = parseOrder(await jsonBody(placed));
  expect(order.promoCode, "Ava's order code").toBe('LEAFY10');

  const avaOrder = await request.get(`/api/orders/${order.id}`, { headers: ava });
  expect(avaOrder.status()).toBe(200);
  const avaBody = parseOrder(await jsonBody(avaOrder));
  expect(avaBody.promoCode).toBe('LEAFY10');

  const benOrder = await request.get(`/api/orders/${order.id}`, { headers: ben });
  expect(benOrder.status(), "Ben reading Ava's order").toBe(404);

  expectMoney(order.discount, 1.25, "Ava's discount");
  expectMoney(avaBody.discount, 1.25, "Ava's fetched discount");
  const benBody = await jsonBody(benOrder);
  expect(isRecord(benBody) ? benBody.rule : 'present', 'a 404 has no rule').toBeUndefined();
  const serialized = JSON.stringify(benBody);
  expect(serialized, "404 body includes Ava's code").not.toContain('LEAFY10');
  expect(serialized, "404 body includes a discount").not.toContain('discount');
});

test('S1 promo routes without a token return auth_required and do not change the cart', { tag: '@api' }, async ({ request }) => {
  const auth = await register(request);
  await addPlant(request, auth, 'pl-pothos');
  const applied = await applyCode(request, auth, 'LEAFY10');
  expect(applied.status).toBe(200);
  const before = parseCart(applied.body);
  expect(before.promoCode).toBe('LEAFY10');

  const post = await request.post('/api/cart/promo', { data: { code: 'FREESHIP' } });
  expect(post.status()).toBe(401);
  const postBody = await jsonBody(post);
  expect(isRecord(postBody) ? postBody.rule : undefined).toBe('auth_required');

  const del = await request.delete('/api/cart/promo');
  expect(del.status()).toBe(401);
  const delBody = await jsonBody(del);
  expect(isRecord(delBody) ? delBody.rule : undefined).toBe('auth_required');

  const after = await getCart(request, auth);
  expect(after.promoCode).toBe('LEAFY10');
  expectMoney(after.discount, before.discount, 'discount unchanged after 401');
  expectMoney(after.total, before.total, 'total unchanged after 401');
});

test('B1 leafy10 and Leafy10 store the catalog code LEAFY10', { tag: '@api' }, async ({ request }) => {
  const lower = await register(request);
  await addPlant(request, lower, 'pl-pothos');
  const lowerApplied = await applyCode(request, lower, 'leafy10');
  expect(lowerApplied.status).toBe(200);
  await expectSchema(request, lowerApplied.body, 'Cart');
  assertCart(parseCart(lowerApplied.body), POTHOS_LEAFY);

  const mixed = await register(request);
  await addPlant(request, mixed, 'pl-pothos');
  const mixedApplied = await applyCode(request, mixed, 'Leafy10');
  expect(mixedApplied.status).toBe(200);
  assertCart(parseCart(mixedApplied.body), POTHOS_LEAFY);
});

test('B1 a later FREESHIP replaces LEAFY10', { tag: '@api' }, async ({ request }) => {
  const auth = await register(request);
  await addPlant(request, auth, 'pl-pothos');
  const first = await applyCode(request, auth, 'LEAFY10');
  expect(first.status).toBe(200);
  expect(parseCart(first.body).promoCode).toBe('LEAFY10');

  const second = await applyCode(request, auth, 'FREESHIP');
  expect(second.status).toBe(200);
  await expectSchema(request, second.body, 'Cart');
  assertCart(parseCart(second.body), POTHOS_FREE);
});

test('B1 DELETE /api/cart/promo clears a code and is fine when none is stored', { tag: '@api' }, async ({ request }) => {
  const auth = await register(request);
  await addPlant(request, auth, 'pl-pothos');
  const applied = await applyCode(request, auth, 'LEAFY10');
  expect(applied.status).toBe(200);

  const cleared = await request.delete('/api/cart/promo', { headers: auth });
  expect(cleared.status()).toBe(200);
  const clearedBody = await jsonBody(cleared);
  await expectSchema(request, clearedBody, 'Cart');
  assertCart(parseCart(clearedBody), POTHOS_NONE);

  const again = await request.delete('/api/cart/promo', { headers: auth });
  expect(again.status()).toBe(200);
  const againBody = await jsonBody(again);
  await expectSchema(request, againBody, 'Cart');
  assertCart(parseCart(againBody), POTHOS_NONE);
});

test('N1 an expired code is refused and the current code stays', { tag: '@api' }, async ({ request }) => {
  const auth = await register(request);
  await addPlant(request, auth, 'pl-pothos');
  const applied = await applyCode(request, auth, 'LEAFY10');
  expect(applied.status).toBe(200);

  const refused = await applyCode(request, auth, 'SPRING5');
  expect(refused.status).toBe(400);
  if (!isRecord(refused.body) || typeof refused.body.detail !== 'string') {
    throw new Error(`Expected an error body, received ${JSON.stringify(refused.body)}`);
  }
  expect(refused.body.rule).toBe('promo_invalid');
  expect(refused.body.detail.toLowerCase()).toContain('expired');

  const cart = await getCart(request, auth);
  assertCart(cart, POTHOS_LEAFY);
});

test('N1 an unknown code is refused and the current code stays', { tag: '@api' }, async ({ request }) => {
  const auth = await register(request);
  await addPlant(request, auth, 'pl-pothos');
  const applied = await applyCode(request, auth, 'LEAFY10');
  expect(applied.status).toBe(200);
  const before = parseCart(applied.body);

  const refused = await applyCode(request, auth, 'NO-SUCH-CODE');
  expect(refused.status).toBe(400);
  expect(isRecord(refused.body) ? refused.body.rule : undefined).toBe('promo_invalid');

  const after = await getCart(request, auth);
  expect(after.promoCode).toBe('LEAFY10');
  expectMoney(after.discount, before.discount, 'discount');
  expectMoney(after.shipping, before.shipping, 'shipping');
  expectMoney(after.total, before.total, 'total');
});

test('N1 a code on an empty cart is empty_cart and the cart stays empty', { tag: '@api' }, async ({ request }) => {
  const auth = await register(request);
  const refused = await applyCode(request, auth, 'LEAFY10');
  expect(refused.status).toBe(400);
  expect(isRecord(refused.body) ? refused.body.rule : undefined).toBe('empty_cart');

  const cart = await getCart(request, auth);
  expect(cart.lines).toEqual([]);
  assertCart(cart, { discount: 0, promoCode: null, shipping: 0, total: 0 });
});

test('N1 a missing or empty code is validation_error and does not change LEAFY10', { tag: '@api' }, async ({ request }) => {
  const auth = await register(request);
  await addPlant(request, auth, 'pl-pothos');
  const applied = await applyCode(request, auth, 'LEAFY10');
  expect(applied.status).toBe(200);
  const before = parseCart(applied.body);
  expect(before.promoCode).toBe('LEAFY10');

  for (const data of [{}, { code: '' }]) {
    const refused = await request.post('/api/cart/promo', { headers: auth, data });
    expect(refused.status(), JSON.stringify(data)).toBe(400);
    const body = await jsonBody(refused);
    expect(isRecord(body) ? body.rule : undefined, JSON.stringify(data)).toBe('validation_error');
    const after = await getCart(request, auth);
    expect(after.promoCode).toBe(before.promoCode);
    expectMoney(after.discount, before.discount, 'discount');
    expectMoney(after.total, before.total, 'total');
  }
});

test('N1 spring5 is refused as expired, the same as SPRING5', { tag: '@api' }, async ({ request }) => {
  const auth = await register(request);
  await addPlant(request, auth, 'pl-pothos');
  const refused = await applyCode(request, auth, 'spring5');
  expect(refused.status).toBe(400);
  if (!isRecord(refused.body) || typeof refused.body.detail !== 'string') {
    throw new Error(`Expected an error body, received ${JSON.stringify(refused.body)}`);
  }
  expect(refused.body.rule).toBe('promo_invalid');
  expect(refused.body.detail.toLowerCase()).toContain('expired');
  const cart = await getCart(request, auth);
  expect(cart.promoCode).toBeNull();
  expectMoney(cart.discount, 0, 'discount');
});
