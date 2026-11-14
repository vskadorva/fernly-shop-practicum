import type { Locator, Page } from '@playwright/test';

export class OrdersPage {
  readonly heading: Locator;
  readonly orderList: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Your orders' });
    this.orderList = page.getByRole('list');
  }

  /**
   * Opens the orders list.
   * @returns This orders page.
   */
  async open(): Promise<OrdersPage> {
    await this.page.goto('/orders');
    return this;
  }
}
