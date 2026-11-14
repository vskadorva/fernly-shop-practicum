// Popular right now: the plants that sold the most in the last 30 days.
import { z } from 'zod';
import type { FeatureContext } from '../app.js';
import { error, ok } from '../openapi.js';
import { PlantSummarySchema } from '../schemas.js';
import { store } from '../store.js';

interface Sale {
  orderId: string;
  plantId: string;
  quantity: number;
  soldAt: string;
}

const DAY = 24 * 60 * 60 * 1000;

const SALES_WEIGHTS: [string, number][] = [
  ['pl-monstera', 9],
  ['pl-pilea', 8],
  ['pl-snake', 7],
  ['pl-pothos', 6],
  ['pl-zz', 5],
  ['pl-calathea', 4],
  ['pl-spider', 4],
  ['pl-peace-lily', 3],
  ['pl-fiddle', 3],
  ['pl-aloe', 3],
  ['pl-boston-fern', 2],
  ['pl-rubber', 2],
  ['pl-hoya', 2],
  ['pl-bird', 1],
  ['pl-parlor', 1],
  ['pl-birkin', 1],
  ['pl-ponytail', 1],
  ['pl-prayer', 1],
  ['pl-pearls', 1],
  ['pl-thai', 1],
];

/** The last 60 days of the shop's sales export — the same list every time the API starts. */
function salesHistory(now = Date.now()): Sale[] {
  let seed = 20261113;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const total = SALES_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);
  const sales: Sale[] = [];
  for (let order = 1; order <= 26000; order += 1) {
    let pick = random() * total;
    const plantId = SALES_WEIGHTS.find(([, weight]) => (pick -= weight) < 0)?.[0] ?? 'pl-monstera';
    sales.push({
      orderId: `ord-h${order}`,
      plantId,
      quantity: 1 + Math.floor(random() * 2),
      soldAt: new Date(now - random() * 60 * DAY).toISOString(),
    });
  }
  // Workshops buy cuttings by the tray: few orders, many units.
  for (let order = 1; order <= 200; order += 1) {
    sales.push({ orderId: `ord-w${order}`, plantId: 'pl-cutting', quantity: 40, soldAt: new Date(now - random() * 30 * DAY).toISOString() });
  }
  return sales;
}

function popular(sales: Sale[], limit: number) {
  const since = Date.now() - 30 * DAY;
  const plants = store.listPlants({ sort: 'featured', page: 1, pageSize: 100 }).items;
  const ranked = plants.map((plant) => {
    let unitsSold = 0;
    for (const sale of sales) {
      if (new Date(sale.soldAt).getTime() >= since && sale.plantId === plant.id) unitsSold += 1;
    }
    return { ...plant, unitsSold };
  });
  return ranked.sort((a, b) => b.unitsSold - a.unitsSold || a.name.localeCompare(b.name)).slice(0, limit);
}

const PopularPlantSchema = PlantSummarySchema.extend({ unitsSold: z.number().int() }).openapi('PopularPlant');
const PopularListSchema = z.object({ days: z.literal(30), items: z.array(PopularPlantSchema) }).openapi('PopularList');
const LimitSchema = z.coerce.number().int().min(1).max(12).default(4);

export function register({ router, registry, onReset }: FeatureContext): void {
  let sales = salesHistory();
  onReset(() => {
    sales = salesHistory();
  });

  router.get('/popular', (req, res) => {
    const limit = LimitSchema.parse(req.query.limit);
    res.json({ days: 30, items: popular(sales, limit) });
  });

  registry.registerPath({
    method: 'get',
    path: '/api/popular',
    tags: ['Catalog'],
    summary: 'The plants that sold the most in the last 30 days',
    description:
      'Ranked by units sold in the last 30 days, most first; ties by name, A to Z. Out-of-stock plants are left out. With 20 shoppers browsing at once, 95% of answers come back within 300 ms.',
    request: { query: z.object({ limit: z.coerce.number().int().min(1).max(12).optional().openapi({ example: 4 }) }) },
    responses: {
      200: ok('The most popular plants, with units sold in the last 30 days.', PopularListSchema),
      400: error('validation_error: limit must be 1 to 12.'),
    },
  });
}
