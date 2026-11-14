import { QuantityStepper } from '../../src/components/QuantityStepper';

describe('QuantityStepper', () => {
  it('calls onChange with value + 1 when + is clicked', { tags: '@component' }, () => {
    const onChange = cy.spy().as('onChange');
    cy.mount(<QuantityStepper value={2} max={5} onChange={onChange} />);

    cy.findByRole('button', { name: 'Increase quantity' }).click();

    cy.get('@onChange').should('have.been.calledOnceWithExactly', 3);
  });

  it('calls onChange with value − 1 when − is clicked', { tags: '@component' }, () => {
    const onChange = cy.spy().as('onChange');
    cy.mount(<QuantityStepper value={2} max={5} onChange={onChange} />);

    cy.findByRole('button', { name: 'Decrease quantity' }).click();

    cy.get('@onChange').should('have.been.calledOnceWithExactly', 1);
  });

  it('disables − at the minimum', { tags: '@component' }, () => {
    cy.mount(<QuantityStepper value={1} max={5} onChange={cy.spy()} />);

    cy.findByRole('button', { name: 'Decrease quantity' }).should('be.disabled');
    cy.findByRole('button', { name: 'Increase quantity' }).should('be.enabled');
  });

  it('disables + at the stock limit', { tags: '@component' }, () => {
    cy.mount(<QuantityStepper value={3} max={3} onChange={cy.spy()} />);

    cy.findByRole('button', { name: 'Increase quantity' }).should('be.disabled');
  });
});
