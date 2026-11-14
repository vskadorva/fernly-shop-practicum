import type { Locator, Page } from '@playwright/test';

export class PlantPage {
  readonly plantNameHeading: Locator;
  readonly addToCartButton: Locator;
  readonly addedToCartStatus: Locator;

  constructor(private readonly page: Page) {
    this.plantNameHeading = page.getByRole('heading', { level: 1 });
    this.addToCartButton = page.getByRole('button', { name: 'Add to cart' });
    this.addedToCartStatus = page.getByRole('status');
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
}
