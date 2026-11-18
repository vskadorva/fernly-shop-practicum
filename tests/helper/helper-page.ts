import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { firstCustomerCredentials } from '../a11y/helpers/session';

const TOKEN_KEY = 'fernly_token';

export type ToolArgs = Record<string, string | number | boolean>;

export type ToolCall = {
  name: string;
  args: ToolArgs;
  source: 'model' | 'direct';
  at: string;
};

declare global {
  interface Window {
    __fernlyHelper?: {
      run: (tool: string, args: ToolArgs) => Promise<unknown>;
      calls: ToolCall[];
      clear: () => void;
    };
  }
}

/**
 * Resets the shop (`POST /api/admin/reset`) and signs the first customer from .env in
 * with a saved token, so the next page load starts signed in with an empty cart.
 * @returns The customer's token.
 */
export async function freshCustomer(page: Page, request: APIRequestContext): Promise<string> {
  const reset = await request.post('/api/admin/reset');
  if (!reset.ok()) throw new Error(`POST /api/admin/reset answered ${reset.status()}`);

  const login = await request.post('/api/auth/login', { data: firstCustomerCredentials() });
  if (!login.ok()) throw new Error(`POST /api/auth/login answered ${login.status()}`);
  const { token } = (await login.json()) as { token: string };

  await page.addInitScript(({ key, value }: { key: string; value: string }) => {
    localStorage.setItem(key, value);
  }, { key: TOKEN_KEY, value: token });
  return token;
}

export class HelperPage {
  readonly toggle: Locator;
  readonly panel: Locator;
  readonly messageList: Locator;
  readonly messages: Locator;
  readonly messageInput: Locator;
  readonly sendButton: Locator;

  constructor(private readonly page: Page) {
    this.toggle = page.getByRole('button', { name: 'Ask Fernly' });
    this.panel = page.getByRole('region', { name: 'Fernly Helper' });
    this.messageList = this.panel.getByRole('log');
    this.messages = this.messageList.getByRole('listitem');
    this.messageInput = this.panel.getByRole('textbox', { name: 'Message the helper' });
    this.sendButton = this.panel.getByRole('button', { name: 'Send' });
  }

  /** The Cart link in the header; its name carries the count ("Cart 2 items"). */
  cartLink(): Locator {
    return this.page.getByRole('banner').getByRole('link', { name: /^Cart\b/ });
  }

  /**
   * Opens the shop and the helper, and clears the recorded tool calls.
   * @returns This helper page.
   */
  async open(): Promise<HelperPage> {
    await this.page.goto('/');
    await this.toggle.click();
    await this.messageInput.waitFor();
    await this.page.waitForFunction(() => window.__fernlyHelper !== undefined);
    await this.page.evaluate(() => window.__fernlyHelper?.clear());
    return this;
  }

  /**
   * Types a message, sends it, and waits until the message list is no longer busy and
   * the helper's reply is shown.
   * @returns This helper page.
   */
  async ask(phrase: string): Promise<HelperPage> {
    const before = await this.messages.count();
    await this.messageInput.fill(phrase);
    await this.sendButton.click();
    const list = await this.messageList.elementHandle();
    await this.page.waitForFunction(
      ({ el, count }) =>
        el !== null && el.getAttribute('aria-busy') === 'false' && el.children.length >= count,
      { el: list, count: before + 2 },
    );
    return this;
  }

  /**
   * Calls a tool directly through `window.__fernlyHelper.run`, exactly as the helper would.
   * @returns The call the shop recorded for it, or undefined if none was recorded.
   */
  async run(tool: string, args: ToolArgs): Promise<ToolCall | undefined> {
    return this.page.evaluate(async ({ name, values }) => {
      const hook = window.__fernlyHelper;
      if (!hook) throw new Error('window.__fernlyHelper is not available');
      const before = hook.calls.length;
      await hook.run(name, values);
      const recorded = hook.calls.slice(before).filter((call) => call.name === name);
      return recorded.length ? JSON.parse(JSON.stringify(recorded[recorded.length - 1])) : undefined;
    }, { name: tool, values: args });
  }

  /** The last tool call the helper picked itself (`source: 'model'`), or undefined. */
  async lastModelCall(): Promise<ToolCall | undefined> {
    return this.page.evaluate(() => {
      const calls = window.__fernlyHelper?.calls ?? [];
      const models = calls.filter((call) => call.source === 'model');
      return models.length ? JSON.parse(JSON.stringify(models[models.length - 1])) : undefined;
    });
  }

  /** Everything in the message list, one message per line. */
  async chatText(): Promise<string> {
    return (await this.messages.allInnerTexts()).join('\n');
  }
}
