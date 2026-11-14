const DISCOUNT_AMOUNT = '\u2212$1.25';

function stubSignedIn() {
  cy.intercept('GET', '/api/auth/me', { fixture: 'cart/me-user.json' }).as('authMe');
}

function stubCartGet(fixture: string, options: { statusCode?: number } = {}) {
  if (options.statusCode) {
    cy.intercept('GET', '/api/cart', {
      statusCode: options.statusCode,
      body: { detail: 'Could not load cart.' },
    }).as('cart');
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

/** Signed-in visit with a stubbed cart. Waits for auth and the first cart load. */
function openCart(cartFixture: string, cartOptions: { statusCode?: number } = {}) {
  stubSignedIn();
  stubCartGet(cartFixture, cartOptions);
  visitCartSignedIn();
  cy.wait('@authMe');
  cy.wait('@cart');
}

function withinSummary(assertFn: () => void) {
  cy.findByRole('heading', { name: 'Order summary' }).parent().within(assertFn);
}

function expectShippingAndTotal(shipping: string, total: string) {
  withinSummary(() => {
    cy.findByText('Shipping').parent().within(() => {
      cy.findByText(shipping);
    });
    cy.findByText('Total').parent().within(() => {
      cy.findByText(total);
    });
  });
}

function expectNoDiscount() {
  withinSummary(() => {
    cy.findByText(/^Discount/).should('not.exist');
  });
}

function expectLeafy10Summary() {
  withinSummary(() => {
    cy.findByText('Discount (LEAFY10)');
    cy.findByText(DISCOUNT_AMOUNT);
    cy.findByText('Total').parent().within(() => {
      cy.findByText('$18.20');
    });
  });
  cy.findAllByText(/LEAFY10/).should('have.length.at.least', 1);
}

function expectPromoUnderSummary() {
  cy.findByRole('heading', { name: 'Order summary' }).parent().then(($summary) => {
    const summaryTop = $summary[0].getBoundingClientRect().top;
    cy.findByRole('textbox', { name: 'Promo code' }).then(($field) => {
      expect($field[0].getBoundingClientRect().top, 'Promo code field sits under the order summary').to.be.greaterThan(
        summaryTop,
      );
    });
    cy.findByRole('button', { name: 'Apply' }).then(($apply) => {
      expect($apply[0].getBoundingClientRect().top, 'Apply sits under the order summary').to.be.greaterThan(summaryTop);
    });
  });
}

function expectVisiblePromoLabelNamesField() {
  cy.findByText('Promo code').should('be.visible');
  cy.findByRole('textbox', { name: 'Promo code' }).then(($field) => {
    const field = $field[0] as HTMLInputElement;
    const labelledBy = (field.getAttribute('aria-labelledby') ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => field.ownerDocument.getElementById(id))
      .filter((node): node is HTMLElement => node instanceof HTMLElement);
    const sources = [...Array.from(field.labels ?? []), ...labelledBy];
    const visibleLabel = sources.find((node) => node.textContent?.replace(/\s+/g, ' ').trim() === 'Promo code');
    expect(visibleLabel, 'accessible name is the visible Promo code label').to.exist;
    expect(visibleLabel, 'Promo code label is visible').to.be.visible;
  });
}

describe('Cart page promo', () => {
  it('U1-01 shows the promo field under the summary and applies leafy10', { tags: '@ui' }, () => {
    openCart('promo/cart-pothos.json');
    cy.intercept('POST', '/api/cart/promo', { fixture: 'promo/cart-pothos-leafy10.json' }).as('applyPromo');

    expectPromoUnderSummary();
    expectShippingAndTotal('$6.95', '$19.45');

    cy.findByRole('textbox', { name: 'Promo code' }).type('leafy10');
    cy.findByRole('button', { name: 'Apply' }).click();
    cy.wait('@applyPromo');

    expectLeafy10Summary();
  });

  it('U1-02 removes the promo code and restores the empty field', { tags: '@ui' }, () => {
    openCart('promo/cart-pothos-leafy10.json');
    cy.intercept('DELETE', '/api/cart/promo', { fixture: 'promo/cart-pothos.json' }).as('removePromo');

    cy.findByRole('button', { name: (name) => name === 'Remove' }).click();
    cy.wait('@removePromo');

    expectNoDiscount();
    expectShippingAndTotal('$6.95', '$19.45');
    cy.findByRole('textbox', { name: 'Promo code' }).then(($field) => {
      expect($field.val(), 'promo field is empty').to.equal('');
    });
  });

  it('U1-03 sends signed-out customers to sign in', { tags: '@ui' }, () => {
    cy.visit('/cart', {
      onBeforeLoad(win) {
        win.localStorage.removeItem('fernly_token');
      },
    });

    cy.url().should('include', '/login?next=/cart');
    cy.findByRole('textbox', { name: 'Promo code' }).should('not.exist');
    cy.findByRole('button', { name: 'Apply' }).should('not.exist');
  });

  it('U1-04 shows Try again when the cart cannot load and hides the promo field', { tags: '@ui' }, () => {
    openCart('promo/cart-pothos.json', { statusCode: 500 });

    cy.findByRole('alert').within(() => {
      cy.findByText("Your cart couldn't be loaded.");
      cy.findByRole('button', { name: 'Try again' });
    });
    cy.findByRole('textbox', { name: 'Promo code' }).should('not.exist');
    cy.findByRole('button', { name: 'Apply' }).should('not.exist');
  });

  it('U1-05 announces an expired code and keeps the total', { tags: '@ui' }, () => {
    openCart('promo/cart-pothos.json');
    cy.intercept('POST', '/api/cart/promo', {
      statusCode: 400,
      body: { detail: 'This code has expired.', rule: 'promo_invalid' },
    }).as('applyPromo');

    cy.findByRole('textbox', { name: 'Promo code' }).type('SPRING5');
    cy.findByRole('button', { name: 'Apply' }).click();
    cy.wait('@applyPromo');

    cy.findByText('This code has expired.').should('be.visible').then(($message) => {
      const announced = $message[0].closest('[role="alert"], [aria-live="assertive"]');
      expect(announced, 'expired sentence is inside an alert').to.not.equal(null);
    });
    expectShippingAndTotal('$6.95', '$19.45');
    expectNoDiscount();
  });

  it('U1-06 shows an empty cart without a summary or promo field', { tags: '@ui' }, () => {
    openCart('promo/cart-empty.json');

    cy.findByRole('heading', { name: 'Your cart is empty' });
    cy.findByText('Plants you add will show up here.');
    cy.findByRole('heading', { name: 'Order summary' }).should('not.exist');
    cy.findByRole('textbox', { name: 'Promo code' }).should('not.exist');
    cy.findByRole('button', { name: 'Apply' }).should('not.exist');
  });

  it('U1-07 disables Apply while the promo request is in flight', { tags: '@ui' }, () => {
    openCart('promo/cart-pothos.json');
    cy.intercept('POST', '/api/cart/promo', {
      delay: 1000,
      fixture: 'promo/cart-pothos-leafy10.json',
    }).as('applyPromo');

    cy.findByRole('textbox', { name: 'Promo code' }).type('leafy10');
    cy.findByRole('button', { name: 'Apply' }).click();
    cy.findByRole('button', { name: 'Apply' }).then(($el) => expect($el).to.be.disabled);
    cy.wait('@applyPromo');

    withinSummary(() => {
      cy.findByText('Total').parent().within(() => {
        cy.findByText('$18.20');
      });
    });
  });

  it('U1-08 replaces LEAFY10 with FREESHIP without Remove', { tags: '@ui' }, () => {
    openCart('promo/cart-pothos.json');
    let applyCount = 0;
    cy.intercept('POST', '/api/cart/promo', (req) => {
      applyCount += 1;
      req.reply({
        fixture: applyCount === 1 ? 'promo/cart-pothos-leafy10.json' : 'promo/cart-pothos-freeship.json',
      });
    }).as('applyPromo');

    cy.findByRole('textbox', { name: 'Promo code' }).type('leafy10');
    cy.findByRole('button', { name: 'Apply' }).click();
    cy.wait('@applyPromo');
    cy.findByText('Discount (LEAFY10)');

    // A new code replaces the old one. Do not click Remove before this Apply.
    cy.findByRole('textbox', { name: 'Promo code' }).clear().type('FREESHIP');
    cy.findByRole('button', { name: 'Apply' }).click();
    cy.wait('@applyPromo');

    withinSummary(() => {
      cy.findByText('Shipping').parent().within(() => {
        cy.findByText('Free');
      });
      cy.findByText('Total').parent().within(() => {
        cy.findByText('$12.50');
      });
      cy.findByText(/^Discount/).should('not.exist');
    });
  });

  it('U1-09 names the promo field and applies it from the keyboard', { tags: '@ui' }, () => {
    openCart('promo/cart-pothos.json');
    cy.intercept('POST', '/api/cart/promo', { fixture: 'promo/cart-pothos-leafy10.json' }).as('applyPromo');

    expectVisiblePromoLabelNamesField();
    cy.findByRole('textbox', { name: 'Promo code' }).type('leafy10');
    cy.findByRole('button', { name: 'Apply' }).focus();
    cy.focused().should('have.text', 'Apply');
    cy.findByRole('textbox', { name: 'Promo code' }).type('{enter}');
    cy.wait('@applyPromo');

    expectLeafy10Summary();
  });
});
