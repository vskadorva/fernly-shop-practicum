import type { Locator, Page } from '@playwright/test';
import { CheckoutPage } from './CheckoutPage';

export class CartPage {
  readonly heading: Locator;
  readonly emptyHeading: Locator;
  readonly promoCodeField: Locator;
  readonly promoCodeLabeledField: Locator;
  readonly applyPromoButton: Locator;
  readonly removePromoButton: Locator;
  readonly goToCheckoutLink: Locator;
  readonly promoAlert: Locator;
  readonly promoCodeLabel: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Your cart' });
    this.emptyHeading = page.getByRole('heading', { name: 'Your cart is empty' });
    this.promoCodeField = page.getByRole('main').getByRole('textbox');
    this.promoCodeLabeledField = page.getByRole('textbox', { name: 'Promo code' });
    this.applyPromoButton = page.getByRole('button', { name: 'Apply' });
    this.removePromoButton = page.getByRole('button', { name: 'Remove' });
    this.goToCheckoutLink = page.getByRole('link', { name: 'Go to checkout' });
    this.promoAlert = page.getByRole('alert');
    this.promoCodeLabel = page.getByText('Promo code', { exact: true });
  }

  /** Order summary region (default title “Order summary”). */
  orderSummary(title = 'Order summary'): Locator {
    return this.page.getByRole('region', { name: title });
  }

  /** Strong text showing which promo code is applied. */
  appliedPromoCode(code: string): Locator {
    return this.page.getByText(code, { exact: true });
  }

  /**
   * Opens the signed-in cart.
   * @returns This cart page.
   */
  async open(): Promise<CartPage> {
    await this.page.goto('/cart');
    return this;
  }

  /**
   * Types a code and clicks Apply (uses the unnamed promo field).
   * @returns This cart page.
   */
  async applyPromoCode(code: string): Promise<CartPage> {
    await this.promoCodeField.fill(code);
    await this.applyPromoButton.click();
    return this;
  }

  /**
   * Clicks Remove on an applied code.
   * @returns This cart page.
   */
  async removePromoCode(): Promise<CartPage> {
    await this.removePromoButton.click();
    return this;
  }

  /**
   * Follows Go to checkout.
   * @returns The checkout page.
   */
  async goToCheckout(): Promise<CheckoutPage> {
    await this.goToCheckoutLink.click();
    return new CheckoutPage(this.page);
  }
}
