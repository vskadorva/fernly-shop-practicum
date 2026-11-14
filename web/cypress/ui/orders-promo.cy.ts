/** Unicode minus (U+2212), the sign the paid summary uses for a discount. */
const DISCOUNT_AMOUNT = '\u2212$1.25';

function parseRgb(color: string): [number, number, number, number] {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!match) {
    throw new Error(`Unsupported color: ${color}`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])];
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(foreground: string, background: string): number {
  const [fr, fg, fb] = parseRgb(foreground);
  const [br, bg, bb] = parseRgb(background);
  const lForeground = relativeLuminance(fr, fg, fb);
  const lBackground = relativeLuminance(br, bg, bb);
  const lighter = Math.max(lForeground, lBackground);
  const darker = Math.min(lForeground, lBackground);
  return (lighter + 0.05) / (darker + 0.05);
}

function opaqueBackground(element: Element): string {
  const view = element.ownerDocument.defaultView;
  if (!view) {
    throw new Error('Element has no window');
  }
  let node: Element | null = element;
  while (node) {
    const background = view.getComputedStyle(node).backgroundColor;
    if (background !== 'transparent' && parseRgb(background)[3] >= 1) {
      return background;
    }
    node = node.parentElement;
  }
  throw new Error('No opaque background');
}

function expectContrastAtLeast(element: Element, minimum: number, label: string) {
  const view = element.ownerDocument.defaultView;
  if (!view) {
    throw new Error(`${label} has no window`);
  }
  const foreground = view.getComputedStyle(element).color;
  const ratio = contrastRatio(foreground, opaqueBackground(element));
  expect(ratio, `${label} contrast`).to.be.at.least(minimum);
}

function stubSignedIn() {
  cy.intercept('GET', '/api/auth/me', { fixture: 'cart/me-user.json' }).as('authMe');
  cy.intercept('GET', '/api/cart', { fixture: 'promo/cart-empty.json' }).as('cart');
}

function visitSignedIn(path: string) {
  cy.visit(path, {
    onBeforeLoad(win) {
      win.localStorage.setItem('fernly_token', 'cypress-test-token');
    },
  });
}

function visitSignedOut(path: string) {
  cy.visit(path, {
    onBeforeLoad(win) {
      win.localStorage.removeItem('fernly_token');
    },
  });
}

function waitForShell() {
  cy.wait('@authMe');
  cy.wait('@cart');
}

describe('Orders promo', () => {
  it('U3-01 shows Paid with Discount (LEAFY10), −$1.25, and total $18.20', { tags: '@ui' }, () => {
    stubSignedIn();
    cy.intercept('GET', '/api/orders/ord-leafy', { fixture: 'promo/order-leafy10.json' }).as('order');
    visitSignedIn('/orders/ord-leafy');
    waitForShell();
    cy.wait('@order');

    cy.findByRole('region', { name: 'Paid' }).within(() => {
      cy.findByRole('heading', { name: 'Paid' });
      cy.findByText('Discount (LEAFY10)');
      cy.findByText(DISCOUNT_AMOUNT);
      cy.findByText('$18.20');
    });
  });

  it('U3-02 shows that order’s total as $18.20', { tags: '@ui' }, () => {
    stubSignedIn();
    cy.intercept('GET', /\/api\/orders$/, { fixture: 'promo/orders-leafy10.json' }).as('orders');
    visitSignedIn('/orders');
    waitForShell();
    cy.wait('@orders');

    cy.findByRole('listitem').within(() => {
      cy.findByRole('link', { name: 'Order ord-leafy' });
      cy.findByText('$18.20');
    });
  });

  it('U3-03 sends signed-out customers to sign in with return to orders', { tags: '@ui' }, () => {
    cy.intercept('GET', /\/api\/orders$/, {
      statusCode: 401,
      body: { detail: 'Sign in required.', rule: 'auth_required' },
    }).as('orders');
    visitSignedOut('/orders');

    cy.url().should('include', '/login?next=/orders');
  });

  it('U3-04 sends signed-out customers to sign in with return to that order', { tags: '@ui' }, () => {
    cy.intercept('GET', '/api/orders/ord-leafy', {
      statusCode: 401,
      body: { detail: 'Sign in required.', rule: 'auth_required' },
    }).as('order');
    visitSignedOut('/orders/ord-leafy');

    cy.url().should('include', '/login?next=/orders/ord-leafy');
  });

  it('U3-05 shows Order not found with no Discount text and no dollar total', { tags: '@ui' }, () => {
    stubSignedIn();
    cy.intercept('GET', '/api/orders/ord-missing', { statusCode: 404, body: {} }).as('order');
    visitSignedIn('/orders/ord-missing');
    waitForShell();
    cy.wait('@order');

    cy.findByRole('heading', { name: 'Order not found' }).then(($heading) => {
      const text = $heading[0].ownerDocument.body.innerText;
      expect(text, 'no Discount text').not.to.match(/Discount/);
      expect(text, 'no dollar total').not.to.match(/\$\d/);
    });
  });

  it('U3-06 shows the load error and Try again', { tags: '@ui' }, () => {
    stubSignedIn();
    cy.intercept('GET', '/api/orders/ord-leafy', {
      statusCode: 500,
      body: { detail: 'Server error' },
    }).as('order');
    visitSignedIn('/orders/ord-leafy');
    waitForShell();
    cy.wait('@order');

    cy.findByRole('alert').within(() => {
      cy.findByText("The order couldn't be loaded.");
      cy.findByRole('button', { name: 'Try again' });
    });
  });

  it('U3-07 omits the Discount row and lists the undiscounted total $19.45', { tags: '@ui' }, () => {
    stubSignedIn();
    cy.intercept('GET', /\/api\/orders$/, { fixture: 'promo/orders-plain.json' }).as('orders');
    cy.intercept('GET', '/api/orders/ord-plain', { fixture: 'promo/order-plain.json' }).as('order');
    visitSignedIn('/orders/ord-plain');
    waitForShell();
    cy.wait('@order');

    cy.findByRole('region', { name: 'Paid' }).then(($region) => {
      expect($region.text(), 'no Discount row').not.to.match(/Discount/);
    });

    visitSignedIn('/orders');
    waitForShell();
    cy.wait('@orders');

    cy.findByRole('listitem').within(() => {
      cy.findByRole('link', { name: 'Order ord-plain' });
      cy.findByText('$19.45');
    });
  });

  it('U3-08 names the paid summary Paid and meets discount text contrast', { tags: '@ui' }, () => {
    stubSignedIn();
    cy.intercept('GET', '/api/orders/ord-leafy', { fixture: 'promo/order-leafy10.json' }).as('order');
    visitSignedIn('/orders/ord-leafy');
    waitForShell();
    cy.wait('@order');

    cy.findByRole('region', { name: 'Paid' }).within(() => {
      cy.findByRole('heading', { name: 'Paid' });
      cy.findByText('Discount (LEAFY10)').then(($label) => {
        expectContrastAtLeast($label[0], 4.5, 'Discount (LEAFY10)');
      });
      cy.findByText(DISCOUNT_AMOUNT).then(($amount) => {
        expectContrastAtLeast($amount[0], 4.5, 'discount amount');
      });
    });
  });
});
