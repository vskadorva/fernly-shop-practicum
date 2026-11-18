const LONG_NAME =
  "Variegated Thai Constellation Monstera (Collector's Edition, Limited Greenhouse Batch, Greenhouse Row Twelve, North Bench)";

function stubSignedIn() {
  cy.intercept('GET', '/api/auth/me', { fixture: 'cart/me-user.json' }).as('authMe');
}

function stubCartGet(
  fixture: string,
  options: { statusCode?: number; delay?: number } = {},
) {
  if (options.statusCode) {
    cy.intercept('GET', '/api/cart', { statusCode: options.statusCode, body: { detail: 'Could not load cart.' } }).as(
      'cart',
    );
    return;
  }
  if (options.delay) {
    cy.intercept('GET', '/api/cart', { delay: options.delay, fixture }).as('cart');
    return;
  }
  cy.intercept('GET', '/api/cart', { fixture }).as('cart');
}

function visitCartSignedIn() {
  cy.visit('/cart', {
    onBeforeLoad(win) {
      win.localStorage.setItem('fernly_token', 'cypress-test-token');
    },
  });
}

/** Signed-in visit with stubbed cart. Waits for auth and the first cart load. */
function openCart(cartFixture: string, cartOptions: { statusCode?: number; delay?: number } = {}) {
  stubSignedIn();
  stubCartGet(cartFixture, cartOptions);
  visitCartSignedIn();
  cy.wait('@authMe');
  cy.wait('@cart');
}

describe('Cart page', () => {
  it('CP-01 shows one line, paid shipping, and checkout link', { tags: '@ui' }, () => {
    openCart('cart/one-line-paid-shipping.json');

    cy.findByRole('heading', { name: 'Your cart' });
    cy.findByText('Maidenhair Fern');
    cy.findByText(/Size S/);
    cy.findByRole('group', { name: 'Quantity of Maidenhair Fern' });
    cy.findByRole('button', { name: 'Remove Maidenhair Fern' });

    cy.findByRole('heading', { name: 'Order summary' }).parent().within(() => {
      cy.findByText('Subtotal (2 items)');
      cy.findByText('$6.95');
      cy.findByText('Free').should('not.exist');
      cy.findByText('$31.95');
    });

    cy.findByRole('link', { name: 'Go to checkout' });
  });

  it('CP-02 shows free shipping when subtotal is at least fifty dollars', { tags: '@ui' }, () => {
    openCart('cart/free-shipping.json');

    cy.findByRole('heading', { name: 'Order summary' }).parent().within(() => {
      cy.findByText('Free');
      cy.findByText('Subtotal (1 item)');
      cy.findByText('$50.00');
    });
  });

  it('CP-03 shows how much more is needed for free shipping', { tags: '@ui' }, () => {
    openCart('cart/below-free-shipping-hint.json');

    cy.findByText('Add $10.00 more for free shipping.');
  });

  it('CP-04 keeps a very long plant name inside its cart line', { tags: '@ui' }, () => {
    openCart('cart/long-name-line.json');

    cy.findByRole('listitem').then(($line) => {
      cy.findByText(LONG_NAME).then(($name) => {
        const line = $line[0].getBoundingClientRect();
        const name = $name[0].getBoundingClientRect();
        expect(name.left, 'plant name left edge').to.be.at.least(line.left);
        expect(name.right, 'plant name right edge').to.be.at.most(line.right);
        expect($name[0].scrollWidth, 'plant name stays inside its line').to.be.at.most($name[0].clientWidth);
      });
    });
  });

  it('CP-05 shows $0.00 for a zero-priced line', { tags: '@ui' }, () => {
    openCart('cart/zero-price-line.json');

    cy.findByRole('listitem').within(() => {
      cy.findAllByText('$0.00').should('have.length.at.least', 1);
    });
  });

  it('CP-06 sends signed-out customers to sign in with return to cart', { tags: '@ui' }, () => {
    cy.visit('/cart', {
      onBeforeLoad(win) {
        win.localStorage.removeItem('fernly_token');
      },
    });

    cy.url().should('include', '/login?next=/cart');
  });

  it('CP-07 shows Try again when the cart cannot load and refetches on retry', { tags: '@ui' }, () => {
    stubSignedIn();
    let cartLoads = 0;
    cy.intercept('GET', '/api/cart', (req) => {
      cartLoads += 1;
      if (cartLoads === 1) {
        req.reply({ statusCode: 500, body: { detail: 'Server error' } });
        return;
      }
      req.reply({ fixture: 'cart/one-line-paid-shipping.json' });
    }).as('cart');

    visitCartSignedIn();
    cy.wait('@authMe');
    cy.wait('@cart');

    cy.findByRole('alert').within(() => {
      cy.findByText("Your cart couldn't be loaded.");
      cy.findByRole('button', { name: 'Try again' }).click();
    });

    cy.wait('@cart');
    cy.findByRole('heading', { name: 'Your cart' });
  });

  it('CP-08 shows the empty cart state with Browse plants', { tags: '@ui' }, () => {
    openCart('cart/empty.json');

    cy.findByRole('heading', { name: 'Your cart is empty' });
    cy.findByText('Plants you add will show up here.');
    cy.findByRole('link', { name: 'Browse plants' }).should('have.attr', 'href', '/');
  });

  it('CP-09 increases quantity through PATCH and updates the cart', { tags: '@ui' }, () => {
    openCart('cart/one-line-qty-one.json');

    cy.intercept('PATCH', '/api/cart/lines/ln-patch-1', { fixture: 'cart/one-line-qty-two.json' }).as('patchLine');

    cy.findByRole('button', { name: 'Increase quantity' }).click();
    cy.wait('@patchLine');

    cy.findByRole('group', { name: 'Quantity of Maidenhair Fern' }).within(() => {
      cy.findByText('2');
    });
    cy.findByText('Subtotal (2 items)');
    cy.findByText('$31.95');
  });

  it('CP-10 disables Increase quantity at the stock limit', { tags: '@ui' }, () => {
    openCart('cart/at-stock-limit.json');

    cy.findByRole('button', { name: 'Increase quantity' }).then(($el) =>
      expect($el, 'Increase quantity at stock limit').to.be.disabled,
    );
    cy.findByRole('group', { name: 'Quantity of Maidenhair Fern' }).within(() => {
      cy.findByText('3');
    });
  });

  it('CP-11 removes a line through DELETE and shows the empty cart', { tags: '@ui' }, () => {
    openCart('cart/one-line-qty-one.json');

    cy.intercept('DELETE', '/api/cart/lines/ln-patch-1', { fixture: 'cart/empty.json' }).as('deleteLine');

    cy.findByRole('button', { name: 'Remove Maidenhair Fern' }).click();
    cy.wait('@deleteLine');

    cy.findByRole('heading', { name: 'Your cart is empty' });
  });

  it('CP-12 disables every stepper and Remove while a quantity change is saving', { tags: '@ui' }, () => {
    openCart('cart/one-line-qty-one.json');

    cy.intercept('PATCH', '/api/cart/lines/ln-patch-1', {
      delay: 1500,
      fixture: 'cart/one-line-qty-two.json',
    }).as('patchLine');

    cy.findByRole('button', { name: 'Increase quantity' }).click();

    cy.findByRole('button', { name: 'Decrease quantity' }).then(($el) =>
      expect($el, 'Decrease while saving').to.be.disabled,
    );
    cy.findByRole('button', { name: 'Increase quantity' }).then(($el) =>
      expect($el, 'Increase while saving').to.be.disabled,
    );
    cy.findByRole('button', { name: 'Remove Maidenhair Fern' }).then(($el) =>
      expect($el, 'Remove while saving').to.be.disabled,
    );

    cy.wait('@patchLine');
  });

  it('CP-13 shows an error toast when PATCH is rejected and keeps the quantity', { tags: '@ui' }, () => {
    openCart('cart/one-line-qty-one.json');

    cy.intercept('PATCH', '/api/cart/lines/ln-patch-1', {
      statusCode: 400,
      body: { detail: 'Not enough stock left.', rule: 'stock_limit' },
    }).as('patchLine');

    cy.findByRole('button', { name: 'Increase quantity' }).click();
    cy.wait('@patchLine');

    cy.findByRole('status').findByText('Not enough stock left.');
    cy.findByRole('group', { name: 'Quantity of Maidenhair Fern' }).within(() => {
      cy.findByText('1');
    });
  });

  it('CP-14 navigates to checkout from Go to checkout', { tags: '@ui' }, () => {
    openCart('cart/one-line-paid-shipping.json');

    cy.findByRole('link', { name: 'Go to checkout' }).click();
    cy.url().should('include', '/checkout');
  });

  it('CP-15 exposes accessible names and focusable controls on a cart line', { tags: '@ui' }, () => {
    openCart('cart/one-line-paid-shipping.json');

    cy.findByRole('group', { name: 'Quantity of Maidenhair Fern' }).within(() => {
      cy.findByRole('button', { name: 'Decrease quantity' }).focus();
      cy.focused().should('have.attr', 'aria-label', 'Decrease quantity');
      cy.findByRole('button', { name: 'Increase quantity' }).focus();
      cy.focused().should('have.attr', 'aria-label', 'Increase quantity');
    });

    cy.findByRole('button', { name: 'Remove Maidenhair Fern' }).focus();
    cy.focused().should('have.text', 'Remove');

    cy.findByRole('link', { name: 'Go to checkout' }).focus();
    cy.focused().should('have.attr', 'href', '/checkout');
  });

  it('CP-16 shows loading copy until a slow cart response arrives', { tags: '@ui' }, () => {
    stubSignedIn();
    stubCartGet('cart/one-line-paid-shipping.json', { delay: 1500 });
    visitCartSignedIn();
    cy.wait('@authMe');

    cy.findByText('Loading your cart…');
    cy.wait('@cart');
    cy.findByRole('heading', { name: 'Your cart' });
  });

  it('CP-17 renders two lines and the combined item count in the summary', { tags: '@ui' }, () => {
    openCart('cart/two-lines.json');

    cy.findAllByRole('listitem').should('have.length', 2);
    cy.findByText('Subtotal (3 items)');
    cy.findByText('Maidenhair Fern');
    cy.findByText('Snake Plant');
  });
});
