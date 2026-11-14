import { z } from 'zod';
import type { FeatureContext } from '../app.js';
import { error, json, ok, secured } from '../openapi.js';
import { CartSchema } from '../schemas.js';
import { store } from '../store.js';

const PromoRequestSchema = z
  .object({ code: z.string().trim().min(1, 'code must not be empty').openapi({ example: 'LEAFY10' }) })
  .openapi('PromoRequest');

export function register({ router, registry, requireUser }: FeatureContext): void {
  router.post('/cart/promo', (req, res) => {
    const user = requireUser(req);
    const body = PromoRequestSchema.parse(req.body ?? {});
    res.json(store.applyPromo(user.id, body.code));
  });

  router.delete('/cart/promo', (req, res) => {
    res.json(store.removePromo(requireUser(req).id));
  });

  registry.registerPath({
    method: 'post',
    path: '/api/cart/promo',
    tags: ['Cart'],
    summary: 'Apply a promo code',
    description:
      'One code per cart; a new code replaces the old one. Codes ignore upper and lower case. Expired or unknown codes are refused (rule: promo_invalid). A percentage code takes that percentage off the subtotal of the plants, never off shipping.',
    security: secured,
    request: { body: json(PromoRequestSchema) },
    responses: {
      200: ok('My cart with the discount.', CartSchema),
      400: error('validation_error, empty_cart or promo_invalid.'),
      401: error('auth_required.'),
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/cart/promo',
    tags: ['Cart'],
    summary: 'Remove the promo code',
    security: secured,
    responses: { 200: ok('My cart without a discount.', CartSchema), 401: error('auth_required.') },
  });
}
