import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { BrowsePage } from '../pages/BrowsePage';
import { CartPage } from '../pages/CartPage';
import type { HelperPage, ToolArgs, ToolCall } from './helper-page';

export type ExpectedCall = { name: string; args: ToolArgs };

export type CheckOutcome = { result: 'passed' | 'failed'; evidence: string };

export type CheckContext = { page: Page; helper: HelperPage; request: APIRequestContext };

export type UiCheck = {
  kind: 'cart page' | 'header count' | 'catalog filter' | 'refusal message';
  /** True when the check loads a new page — that reload would refresh a stale cart count. */
  loadsPage: boolean;
  run: (ctx: CheckContext) => Promise<CheckOutcome>;
};

/** How long "right away" and "the helper says" may take to show. */
const SHOW_MS = 3_000;
const GREETING = /I can find plants/;
const REFUSED = /\b(couldn['’]?t|could not|can['’]?t|cannot|unable to|wasn['’]?t|was not|not added|refused|didn['’]?t|did not)\b/i;

function argValue(raw: string, quoted: string | undefined): string | number | boolean {
  if (quoted !== undefined) return quoted;
  if (raw === 'true' || raw === 'false') return raw === 'true';
  const n = Number(raw);
  return Number.isNaN(n) ? raw : n;
}

/** Reads the call from a "Then the helper calls <tool> with <arg> <value>, … and …" line. */
export function expectedCall(then: string): ExpectedCall | undefined {
  const match = /^the helper calls (\w+)(?: with (.+))?$/.exec(then.trim());
  if (!match) return undefined;
  const [, name, argText] = match;
  const args: ToolArgs = {};
  for (const part of (argText ?? '').split(/,\s*|\s+and\s+/).filter(Boolean)) {
    const pair = /^(\w+)\s+(?:"([^"]*)"|(\S+))$/.exec(part.trim());
    if (!pair) return undefined;
    const [, key, quoted, raw] = pair;
    args[key] = argValue(raw ?? '', quoted);
  }
  return { name, args };
}

function sameArgs(a: ToolArgs, b: ToolArgs): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => a[key] === b[key]);
}

/** Compares a recorded tool call with the expected one. */
export function callOutcome(expected: ExpectedCall, recorded: ToolCall | undefined): CheckOutcome {
  if (!recorded) return { result: 'failed', evidence: `no ${expected.name} call was recorded` };
  const seen = `recorded ${recorded.name} ${JSON.stringify(recorded.args)} (source ${recorded.source})`;
  const matches = recorded.name === expected.name && sameArgs(recorded.args, expected.args);
  return { result: matches ? 'passed' : 'failed', evidence: seen };
}

async function plantName(request: APIRequestContext, plantId: string): Promise<string> {
  const res = await request.get(`/api/plants/${plantId}`);
  if (!res.ok()) throw new Error(`GET /api/plants/${plantId} answered ${res.status()}`);
  return ((await res.json()) as { name: string }).name;
}

async function openCart(page: Page): Promise<{ cart: CartPage; seen: string }> {
  const cart = new CartPage(page);
  await cart.open();
  await cart.lines().first().or(cart.emptyHeading).waitFor();
  const lines = (await cart.lines().allInnerTexts()).map((text) => text.replace(/\s+/g, ' ').trim());
  return { cart, seen: lines.length ? `cart page shows: ${lines.join(' | ')}` : 'cart page shows: Your cart is empty' };
}

function cartHolds(quantity: number, plantId: string, size: 'S' | 'M' | 'L'): UiCheck {
  return {
    kind: 'cart page',
    loadsPage: true,
    run: async ({ page, request }) => {
      const name = await plantName(request, plantId);
      const { cart, seen } = await openCart(page);
      const line = cart.line(name, size);
      try {
        await expect(line).toHaveCount(1);
        await expect(cart.lineQuantity(line)).toHaveText(String(quantity));
        return { result: 'passed', evidence: seen };
      } catch {
        return { result: 'failed', evidence: `expected ${quantity} × ${name} (size ${size}); ${seen}` };
      }
    },
  };
}

function cartHasNo(plantId: string): UiCheck {
  return {
    kind: 'cart page',
    loadsPage: true,
    run: async ({ page, request }) => {
      const name = await plantName(request, plantId);
      const { cart, seen } = await openCart(page);
      const count = await cart.line(name).count();
      return { result: count === 0 ? 'passed' : 'failed', evidence: seen };
    },
  };
}

function headerCount(quantity: number): UiCheck {
  return {
    kind: 'header count',
    loadsPage: false,
    run: async ({ helper }) => {
      const link = helper.cartLink();
      const wanted = new RegExp(`^Cart\\s*${quantity} items?$`);
      try {
        await expect(link).toHaveAccessibleName(wanted, { timeout: SHOW_MS });
        return { result: 'passed', evidence: `header ${(await link.ariaSnapshot()).replace(/^- /, '')}` };
      } catch {
        const shown = (await link.ariaSnapshot()).replace(/^- /, '');
        return { result: 'failed', evidence: `after ${SHOW_MS} ms without a reload the header shows ${shown}` };
      }
    },
  };
}

function onlyPetSafe(): UiCheck {
  return {
    kind: 'catalog filter',
    loadsPage: false,
    run: async ({ page }) => {
      const browse = new BrowsePage(page);
      const cards = page.getByRole('article');
      const filter = page.getByRole('checkbox', { name: 'Pet-safe plants only' });
      try {
        await expect(page).toHaveURL(/[?&]petSafe=true\b/, { timeout: SHOW_MS });
        await browse.plantsCountHeading.waitFor();
      } catch {
        return { result: 'failed', evidence: `catalog not filtered: URL is ${page.url()}` };
      }
      const total = await cards.count();
      const notSafe = await cards.filter({ hasText: 'Not pet safe' }).allInnerTexts();
      const checked = await filter.isChecked();
      const heading = await browse.plantsCountHeading.innerText();
      const evidence =
        `URL ${new URL(page.url()).search}; "${heading}"; ${total} cards; ` +
        `Pet-safe plants only ${checked ? 'checked' : 'not checked'}` +
        (notSafe.length ? `; not pet safe: ${notSafe.map((t) => t.split('\n')[0]).join(', ')}` : '');
      const passed = total > 0 && notSafe.length === 0 && checked;
      return { result: passed ? 'passed' : 'failed', evidence };
    },
  };
}

async function replies(helper: HelperPage): Promise<string> {
  const texts = await helper.messages.filter({ hasText: /^Helper:/ }).filter({ hasNotText: GREETING }).allInnerTexts();
  return texts.length ? texts.join(' | ') : 'no helper reply besides the greeting';
}

function doesNotSay(words: string): UiCheck {
  return {
    kind: 'refusal message',
    loadsPage: false,
    run: async ({ helper }) => {
      await expect(helper.messageList).toHaveAttribute('aria-busy', 'false', { timeout: SHOW_MS });
      const said = await replies(helper);
      return { result: said.includes(words) ? 'failed' : 'passed', evidence: `chat: ${said}` };
    },
  };
}

function says(what: RegExp): UiCheck {
  return {
    kind: 'refusal message',
    loadsPage: false,
    run: async ({ helper }) => {
      const reply = helper.messages.filter({ hasText: /^Helper:/ }).filter({ hasNotText: GREETING }).filter({ hasText: what });
      try {
        await expect(reply.first()).toBeVisible({ timeout: SHOW_MS });
        return { result: 'passed', evidence: `chat: ${await replies(helper)}` };
      } catch {
        return { result: 'failed', evidence: `chat: ${await replies(helper)}` };
      }
    },
  };
}

/**
 * A browser check for a Then line, or undefined when only a judge can decide it
 * (care answers, "doesn't sell", prices in the reply).
 */
export function uiCheck(then: string): UiCheck | undefined {
  const text = then.trim();
  let m: RegExpExecArray | null;
  if ((m = /^the cart holds (\d+) of "([^"]+)" in size "([SML])"$/.exec(text))) {
    return cartHolds(Number(m[1]), m[2], m[3] as 'S' | 'M' | 'L');
  }
  if ((m = /^the cart has no "([^"]+)"$/.exec(text))) return cartHasNo(m[1]);
  if ((m = /^the cart count in the header shows (\d+) right away$/.exec(text))) return headerCount(Number(m[1]));
  if (/^the catalog shows only pet-safe plants$/.test(text)) return onlyPetSafe();
  if ((m = /^the helper does not say "([^"]+)"$/.exec(text))) return doesNotSay(m[1]);
  if (/^the helper says the shop refused the add$/.test(text)) return says(REFUSED);
  if (/^the helper says why: there isn't enough stock$/.test(text)) return says(/\bstock\b/i);
  return undefined;
}

/** Checks that load a new page go last, so a reload can't hide a stale cart count. */
export function inRunOrder<T extends { check: UiCheck }>(items: T[]): T[] {
  return [...items.filter((i) => !i.check.loadsPage), ...items.filter((i) => i.check.loadsPage)];
}

/** Runs a check; never throws — an error becomes a failed outcome with its message. */
export async function runCheck(check: UiCheck, ctx: CheckContext): Promise<CheckOutcome> {
  try {
    return await check.run(ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    return { result: 'failed', evidence: `${check.kind} check could not run: ${message}` };
  }
}
