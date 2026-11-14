/** Discount amounts use Unicode minus U+2212, matching the order summary. */
const DISCOUNT_AMOUNT = '−$1.25';

function parseRgb(color: string): [number, number, number] {
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) {
    throw new Error(`Unsupported color: ${color}`);
  }
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(fg: string, bg: string): number {
  const [fr, fgG, fb] = parseRgb(fg);
  const [br, bgG, bb] = parseRgb(bg);
  const lFg = relativeLuminance(fr, fgG, fb);
  const lBg = relativeLuminance(br, bgG, bb);
  const lighter = Math.max(lFg, lBg);
  const darker = Math.min(lFg, lBg);
  return (lighter + 0.05) / (darker + 0.05);
}

/** First opaque background behind the text. Row wrappers are transparent; the summary paints white. */
function paintedBackground(el: Element, view: Window): string {
  let node: Element | null = el;
  while (node) {
    const bg = view.getComputedStyle(node).backgroundColor;
    const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    const alpha = match?.[4] === undefined ? 1 : Number(match[4]);
    if (match && alpha > 0) return bg;
    node = node.parentElement;
  }
  throw new Error('No opaque background for discount text');
}

function expectContrastAtLeast(text: string, minimum: number) {
  cy.findByText(text).then(($el) => {
    const view = $el[0].ownerDocument.defaultView;
    if (!view) throw new Error(`No window for ${text}`);
    const fg = view.getComputedStyle($el[0]).color;
    const bg = paintedBackground($el[0], view);
    expect(contrastRatio(fg, bg), `${text} contrast`).to.be.at.least(minimum);
  });
}

function stubSignedIn() {
  cy.intercept('GET', '/api/auth/me', { fixture: 'cart/me-user.json' }).as('authMe');
}

function stubCart(fixture: string) {
  cy.intercept('GET', '/api/cart', { fixture }).as('cart');
}

function visitCheckoutSignedIn() {
  cy.visit('/checkout', {
    onBeforeLoad(win) {
      win.localStorage.setItem('fernly_token', 'cypress-test-token');
    },
  });
}

/** Signed-in visit with a stubbed cart. Waits for auth and the cart load. */
function openCheckout(cartFixture: string) {
  stubSignedIn();
  stubCart(cartFixture);
  visitCheckoutSignedIn();
  cy.wait('@authMe');
  cy.wait('@cart');
}

describe('Checkout promo', () => {
  it('U2-01 shows Discount (LEAFY10), −$1.25, shipping $6.95, and total $18.20', { tags: '@ui' }, () => {
    openCheckout('promo/cart-pothos-leafy10.json');

    cy.findByRole('region', { name: 'Order summary' }).within(() => {
      cy.findByText('Discount (LEAFY10)').parent().within(() => {
        cy.findByText(DISCOUNT_AMOUNT);
      });
      cy.findByText('Shipping').parent().within(() => {
        cy.findByText('$6.95');
      });
      cy.findByText('Total').parent().within(() => {
        cy.findByText('$18.20');
      });
    });
  });

  it('U2-02 sends signed-out customers to sign in with return to checkout', { tags: '@ui' }, () => {
    cy.visit('/checkout', {
      onBeforeLoad(win) {
        win.localStorage.removeItem('fernly_token');
      },
    });

    cy.url().should('include', '/login?next=/checkout');
  });

  it('U2-03 shows the empty checkout copy', { tags: '@ui' }, () => {
    openCheckout('promo/cart-empty.json');

    cy.findByRole('heading', { name: 'Your cart is empty' });
    cy.findByText('Add a plant before you check out.');
  });

  it("U2-04 shows Your cart couldn't be loaded and Try again", { tags: '@ui' }, () => {
    stubSignedIn();
    cy.intercept('GET', '/api/cart', { statusCode: 500, body: { detail: 'Could not load cart.' } }).as('cart');
    visitCheckoutSignedIn();
    cy.wait('@authMe');
    cy.wait('@cart');

    cy.findByText("Your cart couldn't be loaded.");
    cy.findByRole('button', { name: 'Try again' });
  });

  it('U2-05 shows Free shipping, no Discount, and total $12.50', { tags: '@ui' }, () => {
    openCheckout('promo/cart-pothos-freeship.json');

    cy.findByRole('region', { name: 'Order summary' }).within(() => {
      cy.findByText('Shipping').parent().within(() => {
        cy.findByText('Free');
      });
      cy.findByText('Total').parent().within(() => {
        cy.findByText('$12.50');
      });
    });
    cy.findByRole('region', { name: 'Order summary' }).then(($summary) => {
      expect($summary.text(), 'summary has no Discount row').not.to.include('Discount');
    });
  });

  it('U2-06 names the summary from Order summary and meets discount contrast', { tags: '@ui' }, () => {
    openCheckout('promo/cart-pothos-leafy10.json');

    cy.findByRole('region', { name: 'Order summary' }).within(() => {
      cy.findByRole('heading', { name: 'Order summary' });
      expectContrastAtLeast('Discount (LEAFY10)', 4.5);
      expectContrastAtLeast(DISCOUNT_AMOUNT, 4.5);
    });
  });
});
