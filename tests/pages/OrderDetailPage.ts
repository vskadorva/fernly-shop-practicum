import type { Locator, Page } from '@playwright/test';

export class OrderDetailPage {
  readonly paidSummary: Locator;

  constructor(private readonly page: Page) {
    this.paidSummary = page.getByRole('region', { name: 'Paid' });
  }
}
