import type { Locator, Page } from '@playwright/test';

export class LoginPage {
  readonly email: Locator;
  readonly password: Locator;
  readonly signInButton: Locator;

  constructor(private readonly page: Page) {
    this.email = page.getByLabel('Email');
    this.password = page.getByLabel('Password');
    this.signInButton = page.getByRole('button', { name: 'Sign in' });
  }

  /**
   * Opens the sign-in form.
   * @returns This login page.
   */
  async open(): Promise<LoginPage> {
    await this.page.goto('/login');
    return this;
  }

  /**
   * Submits email and password.
   * @returns This login page.
   */
  async signInWith(email: string, password: string): Promise<LoginPage> {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.signInButton.click();
    return this;
  }
}
