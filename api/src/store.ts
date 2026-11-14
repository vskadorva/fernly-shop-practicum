import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { ApiError, notFound } from './errors.js';
import { findPromo, PROMOS } from './promos.js';
import { SEED_PLANTS, SEED_USERS, type PlantRecord } from './seed.js';
import type { Cart, CartLine, Order, Plant, PlantSummary, ShippingAddress, SizeLabel, User } from './schemas.js';

interface UserRecord extends User {
  salt: string;
  hash: string;
}

interface LineRecord {
  id: string;
  plantId: string;
  size: SizeLabel;
  quantity: number;
}

interface OrderRecord extends Order {
  userId: string;
}

export interface PlantQuery {
  search?: string;
  light?: string;
  petSafe?: 'true' | 'false';
  sort: 'featured' | 'price-asc' | 'price-desc' | 'name' | 'rating';
  page: number;
  pageSize: number;
}

const SHIPPING_FEE = 6.95;
const FREE_SHIPPING_FROM = 50;

export const toCents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const newId = (prefix: string) => `${prefix}-${randomBytes(4).toString('hex')}`;

function hashPassword(password: string, salt = randomBytes(8).toString('hex')) {
  return { salt, hash: scryptSync(password, salt, 32).toString('hex') };
}

class Store {
  plants: PlantRecord[] = [];
  private users = new Map<string, UserRecord>();
  private carts = new Map<string, LineRecord[]>();
  private orders = new Map<string, OrderRecord>();
  private promos = new Map<string, string>();

  constructor() {
    this.seed();
  }

  seed(): void {
    this.plants = SEED_PLANTS.map((plant) => ({ ...plant, sizes: plant.sizes.map((size) => ({ ...size })) }));
    this.users = new Map(
      SEED_USERS.map((user) => [user.id, { id: user.id, name: user.name, email: user.email, ...hashPassword(user.password) }]),
    );
    this.carts = new Map();
    this.orders = new Map();
    this.promos = new Map();
  }

  applyPromo(userId: string, code: string): Cart {
    if (this.lines(userId).length === 0) throw new ApiError(400, 'Add a plant before you use a code.', 'empty_cart');
    this.promos.set(userId, findPromo(code).code);
    return this.cart(userId);
  }

  removePromo(userId: string): Cart {
    this.promos.delete(userId);
    return this.cart(userId);
  }

  private plant(id: string): PlantRecord {
    const plant = this.plants.find((candidate) => candidate.id === id);
    if (!plant) throw notFound(`Plant ${id}`);
    return plant;
  }

  private summary(plant: PlantRecord): PlantSummary {
    return {
      id: plant.id,
      name: plant.name,
      latinName: plant.latinName,
      price: plant.price,
      light: plant.light,
      careLevel: plant.careLevel,
      petSafe: plant.petSafe,
      stock: plant.stock,
      rating: plant.rating,
      imageUrl: `/plants/${plant.image}.svg`,
    };
  }

  listPlants(query: PlantQuery) {
    let results = [...this.plants];
    if (query.search) {
      const needle = query.search.trim().toLowerCase();
      results = results.filter(
        (plant) => plant.name.toLowerCase().includes(needle) || plant.latinName.toLowerCase().includes(needle),
      );
    }
    if (query.light) {
      const wanted = new Set(query.light.split(',').map((value) => value.trim()));
      results = results.filter((plant) => wanted.has(plant.light));
    }
    if (query.petSafe === 'true') {
      results = results.filter((plant) => plant.petSafe);
    }
    switch (query.sort) {
      case 'price-asc':
      case 'price-desc':
        results.sort((a, b) => a.price - b.price);
        break;
      case 'name':
        results.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'rating':
        results.sort((a, b) => b.rating - a.rating);
        break;
      default:
        break;
    }
    const start = (query.page - 1) * query.pageSize;
    return {
      items: results.slice(start, start + query.pageSize).map((plant) => this.summary(plant)),
      total: results.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  getPlant(id: string) {
    const plant = this.plant(id);
    const similar = this.plants
      .filter((candidate) => candidate.light === plant.light && candidate.id !== plant.id)
      .slice(0, 3)
      .map((candidate) => candidate.id);
    return {
      ...this.summary(plant),
      rating: plant.rating.toFixed(1),
      description: plant.description,
      sizes: plant.sizes.map((size) => ({ ...size })),
      similar,
    } as unknown as Plant;
  }

  register(name: string, email: string, password: string): User {
    const taken = [...this.users.values()].some((user) => user.email.toLowerCase() === email.toLowerCase());
    if (taken) throw new ApiError(400, 'An account with this email already exists.', 'email_taken');
    const user: UserRecord = { id: newId('usr'), name, email, ...hashPassword(password) };
    this.users.set(user.id, user);
    return { id: user.id, name: user.name, email: user.email };
  }

  login(email: string, password: string): User {
    const user = [...this.users.values()].find((candidate) => candidate.email.toLowerCase() === email.toLowerCase());
    const valid =
      user && timingSafeEqual(Buffer.from(hashPassword(password, user.salt).hash, 'hex'), Buffer.from(user.hash, 'hex'));
    if (!user || !valid) throw new ApiError(401, 'Email or password is incorrect.', 'invalid_credentials');
    return { id: user.id, name: user.name, email: user.email };
  }

  user(id: string): User {
    const user = this.users.get(id);
    if (!user) throw new ApiError(401, 'Sign in to continue.', 'auth_required');
    return { id: user.id, name: user.name, email: user.email };
  }

  private lines(userId: string): LineRecord[] {
    if (!this.carts.has(userId)) this.carts.set(userId, []);
    return this.carts.get(userId) as LineRecord[];
  }

  private unitPrice(plant: PlantRecord, size: SizeLabel): number {
    const option = plant.sizes.find((candidate) => candidate.label === size);
    if (!option) throw new ApiError(400, `${plant.name} is not sold in size ${size}.`, 'validation_error');
    return toCents(plant.price + option.priceDelta);
  }

  cart(userId: string): Cart {
    const lines: CartLine[] = this.lines(userId).map((line) => {
      const plant = this.plant(line.plantId);
      const unitPrice = this.unitPrice(plant, line.size);
      return {
        id: line.id,
        plantId: plant.id,
        name: plant.name,
        size: line.size,
        unitPrice,
        quantity: line.quantity,
        lineTotal: toCents(unitPrice * line.quantity),
        stock: plant.stock,
        imageUrl: `/plants/${plant.image}.svg`,
      };
    });
    const subtotal = toCents(lines.reduce((sum, line) => sum + line.lineTotal, 0));
    let shipping = lines.length === 0 || subtotal > FREE_SHIPPING_FROM ? 0 : SHIPPING_FEE;
    const promo = PROMOS.find((candidate) => candidate.code === this.promos.get(userId));
    let discount = 0;
    if (promo?.kind === 'percent') discount = toCents(((subtotal + shipping) * (promo.percent ?? 0)) / 100);
    if (promo?.kind === 'free-shipping') shipping = 0;
    return {
      lines,
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      subtotal,
      discount,
      promoCode: promo?.code ?? null,
      shipping,
      total: toCents(subtotal - discount + shipping),
    };
  }

  private checkStock(plant: PlantRecord, quantity: number): void {
    if (plant.stock === 0) throw new ApiError(400, `${plant.name} is out of stock.`, 'stock_limit');
    if (quantity > plant.stock) {
      throw new ApiError(400, `Only ${plant.stock} of ${plant.name} left in stock.`, 'stock_limit');
    }
  }

  addLine(userId: string, plantId: string, size: SizeLabel, quantity: number): Cart {
    const plant = this.plant(plantId);
    this.unitPrice(plant, size);
    const lines = this.lines(userId);
    const existing = lines.find((line) => line.plantId === plantId && line.size === size);
    this.checkStock(plant, (existing?.quantity ?? 0) + quantity);
    if (existing) existing.quantity += quantity;
    else lines.push({ id: newId('ln'), plantId, size, quantity });
    return this.cart(userId);
  }

  updateLine(userId: string, lineId: string, quantity: number): Cart {
    const line = this.lines(userId).find((candidate) => candidate.id === lineId);
    if (!line) throw notFound(`Cart line ${lineId}`);
    this.checkStock(this.plant(line.plantId), quantity);
    line.quantity = quantity;
    return this.cart(userId);
  }

  removeLine(userId: string, lineId: string): Cart {
    const lines = this.lines(userId);
    const index = lines.findIndex((candidate) => candidate.id === lineId);
    if (index === -1) throw notFound(`Cart line ${lineId}`);
    lines.splice(index, 1);
    return this.cart(userId);
  }

  placeOrder(userId: string, shippingAddress: ShippingAddress): Order {
    const cart = this.cart(userId);
    if (cart.lines.length === 0) throw new ApiError(400, 'Your cart is empty.', 'empty_cart');
    for (const line of cart.lines) this.checkStock(this.plant(line.plantId), line.quantity);
    for (const line of cart.lines) this.plant(line.plantId).stock -= line.quantity;
    const order: OrderRecord = {
      id: newId('ord'),
      userId,
      status: 'placed',
      createdAt: new Date().toISOString(),
      lines: cart.lines.map(({ stock: _stock, ...line }) => line),
      subtotal: cart.subtotal,
      discount: cart.discount,
      promoCode: cart.promoCode,
      shipping: cart.shipping,
      total: cart.total,
      shippingAddress,
    };
    this.orders.set(order.id, order);
    this.carts.set(userId, []);
    this.promos.delete(userId);
    return this.view(order);
  }

  private view(order: OrderRecord): Order {
    const { userId: _userId, ...rest } = order;
    return rest;
  }

  listOrders(userId: string): Order[] {
    return [...this.orders.values()]
      .filter((order) => order.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((order) => this.view(order));
  }

  getOrder(_userId: string, id: string): Order {
    const order = this.orders.get(id);
    if (!order) throw notFound(`Order ${id}`);
    return this.view(order);
  }
}

export const store = new Store();
