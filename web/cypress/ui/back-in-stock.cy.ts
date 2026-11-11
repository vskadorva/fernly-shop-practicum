const PILEA_DESCRIPTION = 'Coin-shaped leaves on thin stems. Currently out of stock.';

function openPlant(id: string, fixture: string) {
  cy.intercept('GET', '/api/plants?*', { fixture: 'back-in-stock/similar.json' }).as('catalog');
  cy.intercept('GET', `/api/plants/${id}`, { fixture }).as('plant');
  cy.visit(`/plants/${id}`, {
    onBeforeLoad(win) {
      win.localStorage.removeItem('fernly_token');
    },
  });
  cy.wait('@plant');
}

describe('Plant page back in stock', () => {
  it('U2 shows Email me when it is back only for an out-of-stock plant', { tags: '@ui' }, () => {
    openPlant('pl-pilea', 'back-in-stock/pilea.json');

    cy.findByRole('heading', { name: 'Chinese Money Plant' });
    cy.url().should('include', '/plants/pl-pilea');
    cy.url().should('not.include', '/login');

    cy.findByText(PILEA_DESCRIPTION).then(($description) => {
      cy.findByText("Email me when it's back").then(($label) => {
        const description = $description[0].getBoundingClientRect();
        const label = $label[0].getBoundingClientRect();
        expect(label.top, 'form sits under the description').to.be.at.least(description.bottom - 1);
      });
    });

    cy.findByRole('textbox', { name: "Email me when it's back" });
    cy.findByRole('button', { name: 'Notify me' });
    cy.findByRole('button', { name: 'Decrease quantity' }).then(($button) => {
      expect($button, 'Decrease quantity when out of stock').to.be.disabled;
    });
    cy.findByRole('button', { name: 'Increase quantity' }).then(($button) => {
      expect($button, 'Increase quantity when out of stock').to.be.disabled;
    });
    cy.findByRole('button', { name: 'Out of stock' }).then(($button) => {
      expect($button, 'Out of stock button').to.be.disabled;
    });
    cy.findByText('Out of stock right now.');

    cy.intercept('POST', '/api/plants/pl-pilea/notify', {
      statusCode: 201,
      fixture: 'back-in-stock/notify-keys.json',
    }).as('notifyKeys');
    cy.findByRole('textbox', { name: "Email me when it's back" }).type('keys@example.com{enter}');
    cy.wait('@notifyKeys').its('request.body').should('deep.equal', { email: 'keys@example.com' });
    cy.findByText(/We'll email keys@example.com when Chinese Money Plant is back/).then(($status) => {
      expect($status.attr('role'), 'Enter submits and the confirmation is announced').to.equal('status');
    });

    openPlant('pl-pilea', 'back-in-stock/pilea.json');
    cy.intercept('POST', '/api/plants/pl-pilea/notify', {
      statusCode: 201,
      fixture: 'back-in-stock/notify-ok.json',
    }).as('notifyOk');
    cy.findByRole('textbox', { name: "Email me when it's back" }).type('name@example.com');
    cy.findByRole('button', { name: 'Notify me' }).click();
    cy.wait('@notifyOk').its('request.body').should('deep.equal', { email: 'name@example.com' });
    cy.findByText(/We'll email name@example.com when Chinese Money Plant is back/).then(($status) => {
      expect($status.attr('role'), 'confirmation is announced').to.equal('status');
    });
    cy.findByRole('button', { name: 'Notify me' }).should('not.exist');

    openPlant('pl-monstera', 'back-in-stock/monstera.json');
    cy.findByRole('heading', { name: 'Monstera Deliciosa' });
    cy.findByRole('button', { name: 'Notify me' }).should('not.exist');
    cy.findByRole('textbox', { name: "Email me when it's back" }).should('not.exist');

    openPlant('pl-pilea', 'back-in-stock/pilea.json');
    cy.intercept('POST', '/api/plants/pl-pilea/notify', {
      statusCode: 400,
      fixture: 'back-in-stock/notify-in-stock.json',
    }).as('notifyInStock');
    cy.findByRole('textbox', { name: "Email me when it's back" }).type('name@example.com');
    cy.findByRole('button', { name: 'Notify me' }).click();
    cy.wait('@notifyInStock');
    cy.findByRole('alert').then(($alert) => {
      expect($alert.text(), 'in_stock message is announced').to.include(
        'Chinese Money Plant is in stock. Add it to your cart instead.',
      );
    });
    cy.findByRole('button', { name: 'Notify me' });

    cy.intercept('POST', '/api/plants/pl-pilea/notify', {
      statusCode: 409,
      fixture: 'back-in-stock/notify-duplicate.json',
    }).as('notifyDuplicate');
    cy.findByRole('button', { name: 'Notify me' }).click();
    cy.wait('@notifyDuplicate');
    cy.findByRole('alert').then(($alert) => {
      expect($alert.text(), 'already on the list is announced').to.include("You're already on the list");
    });
    cy.findByRole('button', { name: 'Notify me' });

    cy.findByRole('textbox', { name: "Email me when it's back" }).clear();
    cy.findByRole('textbox', { name: "Email me when it's back" }).type('kept@example.com');
    cy.intercept('POST', '/api/plants/pl-pilea/notify', {
      statusCode: 500,
      fixture: 'back-in-stock/notify-error.json',
    }).as('notifyError');
    cy.findByRole('button', { name: 'Notify me' }).click();
    cy.wait('@notifyError');
    cy.findByRole('alert').then(($alert) => {
      expect($alert.text(), 'server error is shown').to.include('The sign-up could not be saved.');
    });
    cy.findByRole('textbox', { name: "Email me when it's back" }).then(($field) => {
      expect($field, 'field keeps what the customer typed').to.have.value('kept@example.com');
    });
  });
});
