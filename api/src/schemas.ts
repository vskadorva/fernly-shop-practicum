import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

const money = z.number().openapi({ example: 24.5, description: 'Dollars, two decimals.' });

export const ErrorSchema = z
  .object({
    detail: z.string().openapi({ example: 'Sign in to continue.' }),
    rule: z.string().optional().openapi({
      example: 'stock_limit',
      description: 'Why the request was refused: validation_error, auth_required, invalid_credentials, email_taken, stock_limit or empty_cart (features add their own). Missing on 404 responses.',
    }),
  })
  .openapi('Error');

export const LightSchema = z.enum(['low', 'medium', 'bright']).openapi('Light');
export const SizeLabelSchema = z.enum(['S', 'M', 'L']).openapi('SizeLabel');
export const SortSchema = z.enum(['featured', 'price-asc', 'price-desc', 'name', 'rating']).openapi('Sort');

export const PlantSummarySchema = z
  .object({
    id: z.string().openapi({ example: 'pl-monstera' }),
    name: z.string(),
    latinName: z.string(),
    price: money,
    light: LightSchema,
    careLevel: z.number().int().min(1).max(3).openapi({ description: '1 Easy, 2 Moderate, 3 Expert.' }),
    petSafe: z.boolean(),
    stock: z.number().int().min(0),
    rating: z.number().min(0).max(5).openapi({ example: 4.6 }),
    imageUrl: z.string(),
  })
  .openapi('PlantSummary');

export const PlantSchema = PlantSummarySchema.extend({
  description: z.string(),
  sizes: z.array(z.object({ label: SizeLabelSchema, priceDelta: money })),
  similar: z.array(z.string()).openapi({ description: 'Ids of up to three plants that like the same light.' }),
}).openapi('Plant');

export const PlantListSchema = z
  .object({
    items: z.array(PlantSummarySchema),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  })
  .openapi('PlantList');

export const PlantQuerySchema = z.object({
  search: z.string().optional(),
  light: z.string().optional().openapi({ description: 'Comma-separated: low,medium,bright.' }),
  petSafe: z.enum(['true', 'false']).optional(),
  sort: SortSchema.default('featured'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
});

export const UserSchema = z
  .object({ id: z.string(), name: z.string(), email: z.string() })
  .openapi('User');

export const RegisterSchema = z
  .object({
    name: z.string().trim().min(1, 'name must not be empty'),
    email: z.string().trim().email('email must be a valid email address'),
    password: z.string().min(8, 'password must have at least 8 characters'),
  })
  .openapi('Register');

export const LoginSchema = z
  .object({ email: z.string().trim().min(1), password: z.string().min(1) })
  .openapi('Login');

export const AuthResultSchema = z.object({ token: z.string(), user: UserSchema }).openapi('AuthResult');

const quantity = z.number().int('quantity must be a whole number').min(1, 'quantity must be at least 1').max(20, 'quantity must be 20 or less');

export const CartLineCreateSchema = z
  .object({ plantId: z.string().min(1), size: SizeLabelSchema, quantity })
  .openapi('CartLineCreate');

export const CartLineUpdateSchema = z.object({ quantity }).openapi('CartLineUpdate');

export const CartLineSchema = z
  .object({
    id: z.string(),
    plantId: z.string(),
    name: z.string(),
    size: SizeLabelSchema,
    unitPrice: money,
    quantity: z.number().int(),
    lineTotal: money,
    stock: z.number().int(),
    imageUrl: z.string(),
  })
  .openapi('CartLine');

export const CartSchema = z
  .object({
    lines: z.array(CartLineSchema),
    itemCount: z.number().int(),
    subtotal: money,
    discount: money.openapi({ description: 'Promo discount on the plants, never on shipping.' }),
    promoCode: z.string().nullable(),
    shipping: money,
    total: money,
  })
  .openapi('Cart');

export const ShippingAddressSchema = z
  .object({
    fullName: z.string().trim().min(1, 'fullName must not be empty'),
    address: z.string().trim().min(1, 'address must not be empty'),
    city: z.string().trim().min(1, 'city must not be empty'),
    postalCode: z.string().trim().min(3, 'postalCode must have at least 3 characters'),
  })
  .openapi('ShippingAddress');

export const OrderCreateSchema = z.object({ shippingAddress: ShippingAddressSchema }).openapi('OrderCreate');

export const OrderSchema = z
  .object({
    id: z.string(),
    status: z.literal('placed'),
    createdAt: z.string(),
    lines: z.array(CartLineSchema.omit({ stock: true })),
    subtotal: money,
    discount: money,
    promoCode: z.string().nullable(),
    shipping: money,
    total: money,
    shippingAddress: ShippingAddressSchema,
  })
  .openapi('Order');

export const OrderListSchema = z.array(OrderSchema).openapi('OrderList');

export type PlantSummary = z.infer<typeof PlantSummarySchema>;
export type Plant = z.infer<typeof PlantSchema>;
export type User = z.infer<typeof UserSchema>;
export type CartLine = z.infer<typeof CartLineSchema>;
export type Cart = z.infer<typeof CartSchema>;
export type Order = z.infer<typeof OrderSchema>;
export type ShippingAddress = z.infer<typeof ShippingAddressSchema>;
export type SizeLabel = z.infer<typeof SizeLabelSchema>;
