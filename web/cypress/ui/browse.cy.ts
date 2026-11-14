const LONG_NAME =
  "Variegated Thai Constellation Monstera (Collector's Edition, Limited Greenhouse Batch, Greenhouse Row Twelve, North Bench)";

/** Loads Browse with a stubbed catalog. The shop is running; this never reaches the real GET /api/plants. */
function openBrowse(fixture: string, statusCode = 200) {
  cy.intercept('GET', '/api/plants?*', { statusCode, fixture }).as('plants');
  cy.visit('/', {
    onBeforeLoad(win) {
      win.localStorage.removeItem('fernly_token');
    },
  });
  cy.wait('@plants');
}

describe('Browse page', () => {
  it('shows two plant cards and the heading "2 plants"', { tags: '@ui' }, () => {
    openBrowse('plants/browse-two.json');

    cy.findByRole('heading', { name: '2 plants' });
    cy.findAllByRole('article').should('have.length', 2);
    cy.findByRole('heading', { name: 'Maidenhair Fern' });
    cy.findByRole('heading', { name: 'Snake Plant' });
  });

  it('shows the empty state when the catalog has no plants', { tags: '@ui' }, () => {
    openBrowse('plants/browse-empty.json');

    cy.findByRole('heading', { name: 'No plants match your filters' });
    cy.findByText('Try another search or clear a filter.');
  });

  it('keeps a very long plant name inside its card', { tags: '@ui' }, () => {
    openBrowse('plants/browse-long-name.json');

    cy.findByRole('article').then(($card) => {
      cy.findByRole('heading', { name: LONG_NAME }).then(($name) => {
        const card = $card[0].getBoundingClientRect();
        const name = $name[0].getBoundingClientRect();
        expect(name.left, 'plant name left edge').to.be.at.least(card.left);
        expect(name.right, 'plant name right edge').to.be.at.most(card.right);
        expect(name.top, 'plant name top edge').to.be.at.least(card.top);
        expect(name.bottom, 'plant name bottom edge').to.be.at.most(card.bottom);
        expect($name[0].scrollWidth, 'plant name stays inside its card').to.be.at.most($name[0].clientWidth);
      });
    });
  });

  it('shows $0.00 for a plant priced at 0', { tags: '@ui' }, () => {
    openBrowse('plants/browse-zero-price.json');

    cy.findByRole('article').within(() => {
      cy.findByText('$0.00');
    });
  });

  it('shows an error with Try again when the catalog cannot be loaded', { tags: '@ui' }, () => {
    openBrowse('plants/browse-server-error.json', 500);

    cy.findByRole('alert').within(() => {
      cy.findByRole('button', { name: 'Try again' });
    });
  });
});
