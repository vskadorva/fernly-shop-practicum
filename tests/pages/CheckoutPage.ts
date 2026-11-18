import type { Locator, Page } from '@playwright/test';
import { OrderDetailPage } from './OrderDetailPage';

export interface ShippingAddress {
  fullName: string;
  address: string;
  city: string;
  postalCode: string;
}

export class CheckoutPage {
  readonly fullName: Locator;
  readonly streetAddress: Locator;
  readonly city: Locator;
  readonly postalCode: Locator;
  readonly placeOrderButton: Locator;

  constructor(private readonly page: Page) {
    this.fullName = page.getByLabel('Full name');
    this.streetAddress = page.getByLabel('Street address');
    this.city = page.getByLabel('City');
    this.postalCode = page.getByLabel('Postal code');
    this.placeOrderButton = page.getByRole('button', { name: 'Place order' });
  }

  orderSummary(title = 'Order summary'): Locator {
    return this.page.getByRole('region', { name: title });
  }

  /**
   * Fills shipping fields on the checkout form.
   * @returns This checkout page.
   */
  async fillShipping(address: ShippingAddress): Promise<CheckoutPage> {
    await this.fullName.fill(address.fullName);
    await this.streetAddress.fill(address.address);
    await this.city.fill(address.city);
    await this.postalCode.fill(address.postalCode);
    return this;
  }

  /**
   * Submits the order.
   * @returns The paid order detail page.
   */
  async placeOrder(): Promise<OrderDetailPage> {
    await this.placeOrderButton.click();
    return new OrderDetailPage(this.page);
  }
}
