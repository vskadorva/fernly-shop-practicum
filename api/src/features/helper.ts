// Fernly Helper: a shopping assistant. In a real product a language model reads the message and picks a
// tool; this practice shop uses a built-in stand-in that behaves like one, occasional misses included.
import { z } from 'zod';
import type { FeatureContext } from '../app.js';
import { error, json, ok } from '../openapi.js';
import { store } from '../store.js';

type Light = 'low' | 'medium' | 'bright';
type Size = 'S' | 'M' | 'L';
type ToolCall =
  | { name: 'search_plants'; args: { query?: string; light?: Light; petSafe?: boolean } }
  | { name: 'open_plant'; args: { plantId: string } }
  | { name: 'add_to_cart'; args: { plantId: string; size: Size; quantity: number } }
  | { name: 'care_tip'; args: { plantId: string; topic: 'pets' | 'light' | 'care' } };

const ALIASES: [string, string][] = [
  ['thai constellation', 'pl-thai'],
  ['monstera', 'pl-monstera'],
  ['snake plant', 'pl-snake'],
  ['snake', 'pl-snake'],
  ['zz', 'pl-zz'],
  ['pothos', 'pl-pothos'],
  ['fiddle', 'pl-fiddle'],
  ['peace lily', 'pl-peace-lily'],
  ['calathea', 'pl-calathea'],
  ['spider', 'pl-spider'],
  ['boston fern', 'pl-boston-fern'],
  ['fern', 'pl-boston-fern'],
  ['rubber', 'pl-rubber'],
  ['string of pearls', 'pl-pearls'],
  ['pearls', 'pl-pearls'],
  ['aloe', 'pl-aloe'],
  ['bird of paradise', 'pl-bird'],
  ['parlor palm', 'pl-parlor'],
  ['money plant', 'pl-pilea'],
  ['pilea', 'pl-pilea'],
  ['hoya', 'pl-hoya'],
  ['birkin', 'pl-birkin'],
  ['ponytail', 'pl-ponytail'],
  ['prayer', 'pl-prayer'],
  ['succulent', 'pl-cutting'],
  ['cutting', 'pl-cutting'],
];

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  'a pair of': 2, 'a couple of': 2,
};

const CARE_LABELS = ['', 'easy', 'moderate', 'expert'];

const envSeed = () => Number(process.env.HELPER_SEED) || 0;
let seed = envSeed();
/** Repeatable when HELPER_SEED is set, otherwise as random as a real model. */
function random() {
  if (!seed) return Math.random();
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

function findPlant(text: string) {
  const hit = ALIASES.find(([alias]) => new RegExp(`\\b${alias}(e?s)?\\b`).test(text));
  return hit ? store.getPlant(hit[1]) : undefined;
}

function quantityIn(text: string) {
  const digits = /\b(\d{1,2})\b/.exec(text);
  if (digits) return Number(digits[1]);
  const word = Object.keys(NUMBER_WORDS)
    .sort((a, b) => b.length - a.length)
    .find((candidate) => new RegExp(`\\b${candidate}\\b`).test(text));
  if (!word) return 1;
  return random() < 0.4 ? 1 : NUMBER_WORDS[word];
}

function sizeIn(text: string): Size {
  if (/\b(large|big)\b|\bsize l\b/.test(text)) return 'L';
  if (/\bmedium\b|\bsize m\b/.test(text)) return 'M';
  return 'S';
}

function lightIn(text: string): Light | undefined {
  if (/\b(low light|low-light|dark|shade|shady)\b/.test(text)) return 'low';
  if (/\b(bright|sunny|full sun)\b/.test(text)) return 'bright';
  if (/\b(medium light|indirect)\b/.test(text)) return 'medium';
  return undefined;
}

function petSafeIn(text: string) {
  return /\bpet[- ]safe\b|\bnon[- ]toxic\b|\bsafe for pets\b/.test(text);
}

function careAnswer(plant: ReturnType<typeof store.getPlant>, topic: 'pets' | 'light' | 'care', text: string) {
  if (topic === 'pets') {
    const safe = /\bcats?\b/.test(text) ? plant.careLevel === 1 : plant.petSafe;
    return safe ? `Yes — ${plant.name} is safe for cats and dogs.` : `No — ${plant.name} isn't safe for pets. Keep it out of reach.`;
  }
  if (topic === 'light') return `${plant.name} likes ${plant.light} light.`;
  return `${plant.name} is ${CARE_LABELS[plant.careLevel]} to care for.`;
}

export function understand(raw: string): { reply: string; toolCall: ToolCall | null } {
  const text = raw.toLowerCase().trim();
  const plant = findPlant(text);

  const offCatalog = /\bdo you (sell|have|carry|stock)\b\s+(?:any\s+)?([a-z]+)/.exec(text);
  if (offCatalog && !plant) {
    const name = offCatalog[2].replace(/s$/, '');
    return { reply: `Yes! Our ${name[0].toUpperCase()}${name.slice(1)} is $24 and loves bright, indirect light.`, toolCall: null };
  }

  if (plant && /\b(safe|toxic|poisonous)\b/.test(text)) {
    return { reply: careAnswer(plant, 'pets', text), toolCall: { name: 'care_tip', args: { plantId: plant.id, topic: 'pets' } } };
  }
  if (plant && /\b(light|sun)\b/.test(text) && /\?|how much|what kind|does/.test(text)) {
    return { reply: careAnswer(plant, 'light', text), toolCall: { name: 'care_tip', args: { plantId: plant.id, topic: 'light' } } };
  }
  if (plant && /\b(care|water|hard|difficult|easy)\b/.test(text) && /\?|how/.test(text)) {
    return { reply: careAnswer(plant, 'care', text), toolCall: { name: 'care_tip', args: { plantId: plant.id, topic: 'care' } } };
  }

  if (plant && /\b(add|put|buy|order|grab|get me|i'?d like|i want|i'll take)\b/.test(text)) {
    const quantity = quantityIn(text);
    const size = sizeIn(text);
    return {
      reply: `Added ${quantity} × ${plant.name} (${size}) to your cart.`,
      toolCall: { name: 'add_to_cart', args: { plantId: plant.id, size, quantity } },
    };
  }

  const light = lightIn(text);
  const petSafe = petSafeIn(text);
  if (light || petSafe || /\b(find|search|show me|look for|recommend|which|any)\b/.test(text)) {
    if (plant && !light && !petSafe && /\b(show me|open|tell me about)\b/.test(text)) {
      return { reply: `Opening ${plant.name}.`, toolCall: { name: 'open_plant', args: { plantId: plant.id } } };
    }
    const args: { query?: string; light?: Light; petSafe?: boolean } = {};
    if (plant) args.query = plant.name.split(' ')[0];
    if (light) args.light = light;
    if (petSafe) args.petSafe = true;
    return { reply: 'Here is what I found in the shop.', toolCall: { name: 'search_plants', args } };
  }

  if (plant) return { reply: `Opening ${plant.name}.`, toolCall: { name: 'open_plant', args: { plantId: plant.id } } };
  return { reply: 'I can find plants, open a plant page, add plants to your cart and answer care questions.', toolCall: null };
}

const ChatRequestSchema = z.object({ text: z.string().trim().min(1).max(500) }).openapi('HelperChatRequest');
const ToolCallSchema = z
  .object({ name: z.enum(['search_plants', 'open_plant', 'add_to_cart', 'care_tip']), args: z.record(z.unknown()) })
  .openapi('HelperToolCall');
const ChatResponseSchema = z.object({ reply: z.string(), toolCall: ToolCallSchema.nullable() }).openapi('HelperChatResponse');

export function register({ router, registry, onReset }: FeatureContext): void {
  onReset(() => {
    seed = envSeed();
  });

  router.post('/helper/chat', async (req, res) => {
    const { text } = ChatRequestSchema.parse(req.body ?? {});
    await new Promise((resolve) => setTimeout(resolve, 200 + Math.floor(random() * 500)));
    res.json(understand(text));
  });

  registry.registerPath({
    method: 'post',
    path: '/api/helper/chat',
    tags: ['Helper'],
    summary: 'Ask Fernly Helper: it answers and may pick one tool for the shop to run',
    description:
      'The helper reads the message and returns a reply and, when it decides to act, one tool call: search_plants, open_plant, add_to_cart or care_tip. The browser runs the tool. Like a language model, the same message can now and then be understood differently; HELPER_SEED on the API makes it repeatable.',
    request: { body: json(ChatRequestSchema) },
    responses: {
      200: ok('The reply, and the tool the helper picked (or null).', ChatResponseSchema),
      400: error('validation_error: text is required (1 to 500 characters).'),
    },
  });
}
