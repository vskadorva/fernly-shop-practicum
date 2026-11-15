import type { Locator, Page } from '@playwright/test';

export class PlantPage {
  readonly plantNameHeading: Locator;
  readonly addToCartButton: Locator;
  readonly addedToCartStatus: Locator;
  readonly description: Locator;
  readonly notifyEmail: Locator;
  readonly notifyMeButton: Locator;
  readonly backInStockConfirmation: Locator;
  readonly notifyAlert: Locator;
  readonly decreaseQuantity: Locator;
  readonly increaseQuantity: Locator;
  readonly outOfStockButton: Locator;
  readonly outOfStockNote: Locator;

  constructor(private readonly page: Page) {
    this.plantNameHeading = page.getByRole('heading', { level: 1 });
    this.addToCartButton = page.getByRole('button', { name: 'Add to cart' });
    this.addedToCartStatus = page.getByRole('status');
    this.description = page.getByText('Coin-shaped leaves on thin stems. Currently out of stock.');
    this.notifyEmail = page.getByRole('textbox', { name: "Email me when it's back" });
    this.notifyMeButton = page.getByRole('button', { name: 'Notify me' });
    this.backInStockConfirmation = page.getByRole('status').filter({ hasText: "We'll email" });
    this.notifyAlert = page.getByRole('alert');
    this.decreaseQuantity = page.getByRole('button', { name: 'Decrease quantity' });
    this.increaseQuantity = page.getByRole('button', { name: 'Increase quantity' });
    this.outOfStockButton = page.getByRole('button', { name: 'Out of stock' });
    this.outOfStockNote = page.getByText('Out of stock right now.', { exact: true });
  }

  /**
   * Opens a plant detail page.
   * @param plantId Seed plant id (e.g. `pl-pothos`).
   * @returns This plant page.
   */
  async open(plantId: string): Promise<PlantPage> {
    await this.page.goto(`/plants/${plantId}`);
    return this;
  }

  /**
   * Clicks Add to cart with the current size and quantity.
   * @returns This plant page.
   */
  async addToCart(): Promise<PlantPage> {
    await this.addToCartButton.click();
    return this;
  }

  /**
   * Types an address into the back-in-stock field.
   * @param email Address to enter.
   * @returns This plant page.
   */
  async fillNotifyEmail(email: string): Promise<PlantPage> {
    await this.notifyEmail.fill(email);
    return this;
  }

  /**
   * Clicks Notify me.
   * @returns This plant page.
   */
  async submitNotify(): Promise<PlantPage> {
    await this.notifyMeButton.click();
    return this;
  }

  /**
   * Tabs until the back-in-stock field is focused, or until `maxTabs` is reached.
   * @param maxTabs How many Tab presses to try.
   * @returns This plant page.
   */
  async focusNotifyByTabbing(maxTabs = 40): Promise<PlantPage> {
    for (let i = 0; i < maxTabs; i += 1) {
      const focused = await this.notifyEmail.evaluate((el) => el === document.activeElement);
      if (focused) return this;
      await this.page.keyboard.press('Tab');
    }
    return this;
  }

  /**
   * Types with the keyboard into whatever is focused.
   * @param email Address to type.
   * @returns This plant page.
   */
  async typeNotifyEmail(email: string): Promise<PlantPage> {
    await this.page.keyboard.type(email);
    return this;
  }

  /**
   * Presses Enter.
   * @returns This plant page.
   */
  async pressEnter(): Promise<PlantPage> {
    await this.page.keyboard.press('Enter');
    return this;
  }
}
