function rectsOverlap(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function openBrowse() {
  cy.intercept('GET', '/api/plants?*', { fixture: 'back-in-stock/browse.json' }).as('plants');
  cy.visit('/', {
    onBeforeLoad(win) {
      win.localStorage.removeItem('fernly_token');
      win.localStorage.removeItem('fernly_saved');
    },
  });
  cy.wait('@plants');
}

describe('Browse stock badges', () => {
  it('U1 shows Only N left with the tags and never over the photo or save button', { tags: '@ui' }, () => {
    openBrowse();

    cy.findByRole('heading', { name: '5 plants' });

    const lowStock = [
      { name: 'String of Pearls', count: 1 },
      {
        name: "Variegated Thai Constellation Monstera (Collector's Edition, Limited Greenhouse Batch)",
        count: 2,
      },
      { name: 'Hoya Carnosa', count: 3 },
    ];

    cy.findByRole('heading', { name: 'Fiddle Leaf Fig' })
      .closest('article')
      .then(($card) => {
        expect($card.text(), 'stock 4 has no badge').to.not.match(/Only \d+ left/);
      });

    cy.findByRole('heading', { name: 'Chinese Money Plant' })
      .closest('article')
      .within(() => {
        cy.findByText('Out of stock');
      });
    cy.findByRole('heading', { name: 'Chinese Money Plant' })
      .closest('article')
      .then(($card) => {
        expect($card.text(), 'stock 0 never says Only 0 left').to.not.include('Only 0 left');
      });

    for (const plant of lowStock) {
      cy.findByRole('heading', { name: plant.name })
        .closest('article')
        .within(() => {
          cy.findByText(`Only ${plant.count} left`);
          cy.findByText(/care/);
          cy.findByText(/pet safe/i);
        });

      cy.findByRole('heading', { name: plant.name })
        .closest('article')
        .within(() => {
          cy.findByRole('heading', { level: 3 }).then(($name) => {
            cy.findByText(`Only ${plant.count} left`).then(($badge) => {
              cy.findByRole('img').then(($photo) => {
                cy.findByRole('button').then(($save) => {
                  cy.findByText(/care/).then(($care) => {
                    const nameBox = $name[0].getBoundingClientRect();
                    const badgeBox = $badge[0].getBoundingClientRect();
                    const photoBox = $photo[0].getBoundingClientRect();
                    const saveBox = $save[0].getBoundingClientRect();
                    const careBox = $care[0].getBoundingClientRect();
                    const withTags = badgeBox.bottom > careBox.top && badgeBox.top < careBox.bottom;
                    expect(badgeBox.top, `${plant.name}: badge sits under the plant name`).to.be.at.least(
                      nameBox.bottom - 1,
                    );
                    expect(withTags, `${plant.name}: badge sits with the care and pet tags`).to.equal(true);
                    expect(rectsOverlap(badgeBox, photoBox), `${plant.name}: badge covers the photo`).to.equal(false);
                    expect(rectsOverlap(badgeBox, saveBox), `${plant.name}: badge covers the save button`).to.equal(
                      false,
                    );
                    expect($save.attr('aria-pressed'), `${plant.name}: save button keeps aria-pressed`).to.match(
                      /true|false/,
                    );
                  });
                });
              });
            });
          });
        });
    }

    cy.findByRole('heading', { name: 'String of Pearls' }).closest('article').within(() => {
      cy.findByRole('button').click();
      cy.findByRole('button').then(($button) => {
        expect($button.attr('aria-pressed'), 'save button can be pressed').to.equal('true');
      });
    });
  });
});
