import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import { expectSchema } from '../helpers/schema';

/**
 * Back-in-stock sign-up against docs/features/back-in-stock.md and OpenAPI.
 * A mismatch with the running API is a failure to keep, not an assertion to edit.
 * Each row starts from seed data. reset.setup.ts resets once per command; these
 * rows call reset again so one file can run every row on a clean list.
 */

const ADDRESS = {
  shippingAddress: {
    fullName: 'Ava Green',
    address: '1 Fern Lane',
    city: 'Portland',
    postalCode: '97201',
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function resetShop(request: APIRequestContext): Promise<void> {
  const response = await request.post('/api/admin/reset');
  expect(response.status(), 'reset seed data').toBe(200);
}

async function readBody(response: APIResponse): Promise<{ text: string; body: unknown }> {
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    body = undefined;
  }
  return { text, body };
}

async function postNotify(
  request: APIRequestContext,
  plantId: string,
  data: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<APIResponse> {
  return request.post(`/api/plants/${plantId}/notify`, { data, headers });
}

async function register(request: APIRequestContext): Promise<{ Authorization: string }> {
  const email = `notify-${crypto.randomUUID()}@fernly.test`;
  const response = await request.post('/api/auth/register', {
    data: { name: 'Notify Buyer', email, password: 'Fernly-Test-2026' },
  });
  const { text, body } = await readBody(response);
  expect(response.status(), text).toBe(201);
  if (!isRecord(body) || typeof body.token !== 'string') {
    throw new Error('Register did not return a token');
  }
  return { Authorization: `Bearer ${body.token}` };
}

/** Buys the whole seed stock of pl-thai (2) so the plant is out of stock. */
async function sellOutThai(request: APIRequestContext): Promise<void> {
  const auth = await register(request);
  const added = await request.post('/api/cart/lines', {
    headers: auth,
    data: { plantId: 'pl-thai', size: 'S', quantity: 2 },
  });
  const addedBody = await readBody(added);
  expect(added.status(), addedBody.text).toBe(200);
  const ordered = await request.post('/api/orders', { headers: auth, data: ADDRESS });
  const orderedBody = await readBody(ordered);
  expect(ordered.status(), orderedBody.text).toBe(201);
}

async function expectSubscribed(
  request: APIRequestContext,
  response: APIResponse,
  plantId: string,
  email: string,
): Promise<void> {
  const { text, body } = await readBody(response);
  expect(response.status(), text).toBe(201);
  expect(response.status(), text).not.toBe(401);
  await expectSchema(request, body, 'NotifyResult');
  expect(body).toEqual({ status: 'subscribed', plantId, email });
}

async function expectRule(
  request: APIRequestContext,
  response: APIResponse,
  status: number,
  rule: string,
): Promise<void> {
  const { text, body } = await readBody(response);
  expect(response.status(), text).toBe(status);
  await expectSchema(request, body, 'Error');
  if (!isRecord(body)) {
    throw new Error(`Expected an error object, received ${text}`);
  }
  expect(body.rule, text).toBe(rule);
}

test('P1 signs up with no account and does not publish the list', { tag: '@api' }, async ({ request }) => {
  await resetShop(request);

  const anonymous = await postNotify(request, 'pl-pilea', { email: 'ava@fernly.test' });
  await expectSubscribed(request, anonymous, 'pl-pilea', 'ava@fernly.test');

  const listed = await request.get('/api/plants/pl-pilea/notify');
  const listedBody = await readBody(listed);
  expect(listed.status(), listedBody.text).not.toBe(200);
  expect(listedBody.text).not.toContain('ava@fernly.test');
  expect(listedBody.text).not.toContain('ben@fernly.test');

  const login = await request.post('/api/auth/login', {
    data: {
      email: process.env.FERNLY_ALT_USER_EMAIL ?? 'ben@fernly.test',
      password: process.env.FERNLY_ALT_USER_PASSWORD ?? 'Fernly-Ben-2026',
    },
  });
  const loginBody = await readBody(login);
  expect(login.status(), loginBody.text).toBe(200);
  if (!isRecord(loginBody.body) || typeof loginBody.body.token !== 'string') {
    throw new Error('Ben login did not return a token');
  }

  const asBen = await postNotify(request, 'pl-pilea', { email: 'ava@fernly.test' }, {
    Authorization: `Bearer ${loginBody.body.token}`,
  });
  await expectSubscribed(request, asBen, 'pl-pilea', 'ava@fernly.test');
});

test('A1 signs up an out-of-stock plant and 404s an unknown plant', { tag: '@api' }, async ({ request }) => {
  await resetShop(request);

  const first = await postNotify(request, 'pl-pilea', { email: 'name@example.com' });
  await expectSubscribed(request, first, 'pl-pilea', 'name@example.com');

  const second = await postNotify(request, 'pl-pilea', { email: 'other@example.com' });
  await expectSubscribed(request, second, 'pl-pilea', 'other@example.com');

  const missing = await postNotify(request, 'pl-nope', { email: 'name@example.com' });
  const missingBody = await readBody(missing);
  expect(missing.status(), missingBody.text).toBe(404);
  await expectSchema(request, missingBody.body, 'Error');
  if (!isRecord(missingBody.body)) {
    throw new Error(`Expected an error object, received ${missingBody.text}`);
  }
  expect(missingBody.body, missingBody.text).not.toHaveProperty('rule');
  expect(typeof missingBody.body.detail, missingBody.text).toBe('string');

  await sellOutThai(request);
  const thai = await postNotify(request, 'pl-thai', { email: 'name@example.com' });
  await expectSubscribed(request, thai, 'pl-thai', 'name@example.com');
});

test('A2 accepts only a full email address', { tag: '@api' }, async ({ request }) => {
  await resetShop(request);

  const refused: Array<{ label: string; data: Record<string, unknown> }> = [
    { label: 'a@b', data: { email: 'a@b' } },
    { label: 'name@', data: { email: 'name@' } },
    { label: 'plain', data: { email: 'plain' } },
    { label: 'empty', data: { email: '' } },
    { label: 'missing email', data: {} },
    { label: '@example.com', data: { email: '@example.com' } },
  ];

  for (const attempt of refused) {
    const response = await postNotify(request, 'pl-pilea', attempt.data);
    const { text, body } = await readBody(response);
    expect.soft(response.status(), `${attempt.label}: ${text}`).toBe(400);
    if (response.status() === 400) {
      await expectSchema(request, body, 'Error');
      expect.soft(isRecord(body) ? body.rule : undefined, `${attempt.label} rule`).toBe('validation_error');
    }
  }

  const named = await postNotify(request, 'pl-pilea', { email: 'name@example.com' });
  await expectSubscribed(request, named, 'pl-pilea', 'name@example.com');

  const ava = await postNotify(request, 'pl-pilea', { email: 'ava@fernly.test' });
  await expectSubscribed(request, ava, 'pl-pilea', 'ava@fernly.test');
});

test('A3 allows one sign-up per email per plant, ignoring case', { tag: '@api' }, async ({ request }) => {
  await resetShop(request);
  await sellOutThai(request);

  const first = await postNotify(request, 'pl-pilea', { email: 'ava@fernly.test' });
  await expectSubscribed(request, first, 'pl-pilea', 'ava@fernly.test');

  const otherPlant = await postNotify(request, 'pl-thai', { email: 'ava@fernly.test' });
  await expectSubscribed(request, otherPlant, 'pl-thai', 'ava@fernly.test');

  const otherEmail = await postNotify(request, 'pl-pilea', { email: 'other@example.com' });
  await expectSubscribed(request, otherEmail, 'pl-pilea', 'other@example.com');

  const repeat = await postNotify(request, 'pl-pilea', { email: 'ava@fernly.test' });
  const repeatBody = await readBody(repeat);
  expect.soft(repeat.status(), repeatBody.text).toBe(409);
  if (repeat.status() === 409) {
    await expectSchema(request, repeatBody.body, 'Error');
    expect.soft(isRecord(repeatBody.body) ? repeatBody.body.rule : undefined, repeatBody.text).toBe('already_subscribed');
  }

  const differentCase = await postNotify(request, 'pl-pilea', { email: 'AVA@Fernly.TEST' });
  const caseBody = await readBody(differentCase);
  expect.soft(differentCase.status(), caseBody.text).toBe(409);
  if (differentCase.status() === 409) {
    await expectSchema(request, caseBody.body, 'Error');
    expect.soft(isRecord(caseBody.body) ? caseBody.body.rule : undefined, caseBody.text).toBe('already_subscribed');
  }

  await resetShop(request);
  const afterReset = await postNotify(request, 'pl-pilea', { email: 'ava@fernly.test' });
  await expectSubscribed(request, afterReset, 'pl-pilea', 'ava@fernly.test');
});

test('A4 refuses sign-ups for plants that are still in stock', { tag: '@api' }, async ({ request }) => {
  await resetShop(request);

  const inStock = ['pl-monstera', 'pl-hoya', 'pl-pearls', 'pl-thai'] as const;
  for (const plantId of inStock) {
    const response = await postNotify(request, plantId, { email: 'name@example.com' });
    await expectRule(request, response, 400, 'in_stock');
  }

  await sellOutThai(request);
  const soldOut = await postNotify(request, 'pl-thai', { email: 'name@example.com' });
  await expectSubscribed(request, soldOut, 'pl-thai', 'name@example.com');
});

test('SCH1 matches NotifyResult and the error shape on notify responses', { tag: '@api' }, async ({ request }) => {
  await resetShop(request);

  const sent = { email: 'schema@example.com' };
  await expectSchema(request, sent, 'NotifyRequest');

  const invalid = await postNotify(request, 'pl-pilea', { email: 'plain' });
  await expectRule(request, invalid, 400, 'validation_error');

  const stocked = await postNotify(request, 'pl-monstera', { email: 'schema@example.com' });
  await expectRule(request, stocked, 400, 'in_stock');

  const missing = await postNotify(request, 'pl-nope', { email: 'schema@example.com' });
  const missingBody = await readBody(missing);
  expect(missing.status(), missingBody.text).toBe(404);
  await expectSchema(request, missingBody.body, 'Error');
  expect(isRecord(missingBody.body) ? missingBody.body.rule : 'present', missingBody.text).toBeUndefined();

  const created = await postNotify(request, 'pl-pilea', sent);
  await expectSubscribed(request, created, 'pl-pilea', sent.email);

  const again = await postNotify(request, 'pl-pilea', sent);
  const againBody = await readBody(again);
  expect.soft(again.status(), againBody.text).toBe(409);
  if (again.status() === 409) {
    await expectSchema(request, againBody.body, 'Error');
    expect.soft(isRecord(againBody.body) ? againBody.body.rule : undefined, againBody.text).toBe('already_subscribed');
  }
});
