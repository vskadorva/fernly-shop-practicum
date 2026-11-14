import { PromoCodeInput } from '../../src/components/PromoCodeInput';

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

/** Painted background behind text, skipping transparent ancestors. */
function opaqueBackground(el: Element): string {
  let current: Element | null = el;
  while (current) {
    const bg = window.getComputedStyle(current).backgroundColor;
    if (bg !== 'transparent') {
      const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (match) {
        const alpha = match[4] === undefined ? 1 : Number(match[4]);
        if (alpha > 0) {
          return `rgb(${match[1]}, ${match[2]}, ${match[3]})`;
        }
      }
    }
    current = current.parentElement;
  }
  throw new Error('No opaque background behind the error text');
}

function assertKeyboardFocusVisible($el: JQuery<HTMLElement>, label: string) {
  expect($el[0], `${label} has keyboard focus`).to.equal(document.activeElement);
  const style = window.getComputedStyle($el[0]);
  expect(style.outlineStyle, `${label} outline style`).to.not.equal('none');
  expect(parseFloat(style.outlineWidth), `${label} outline width`).to.be.greaterThan(0);
}

describe('PromoCodeInput', () => {
  it('C2-01 shows a visible Promo code label and an Apply button', { tags: '@component' }, () => {
    cy.mount(<PromoCodeInput appliedCode={null} onApply={cy.spy()} onRemove={cy.spy()} />);

    cy.findByText('Promo code');
    cy.findByLabelText('Promo code');
    cy.findByRole('button', { name: 'Apply' });
  });

  it('C2-02 calls onApply once with the typed code leafy10', { tags: '@component' }, () => {
    const onApply = cy.spy().as('onApply');
    cy.mount(<PromoCodeInput appliedCode={null} onApply={onApply} onRemove={cy.spy()} />);

    cy.findByRole('textbox', { name: 'Promo code' }).type('leafy10');
    cy.findByRole('button', { name: 'Apply' }).click();

    cy.get('@onApply').should('have.been.calledOnceWithExactly', 'leafy10');
  });

  it('C2-03 shows LEAFY10 and Remove calls onRemove', { tags: '@component' }, () => {
    const onRemove = cy.spy().as('onRemove');
    cy.mount(<PromoCodeInput appliedCode="LEAFY10" onApply={cy.spy()} onRemove={onRemove} />);

    cy.findByText('LEAFY10');
    cy.findByRole('button', { name: 'Remove' }).click();

    cy.get('@onRemove').should('have.been.calledOnce');
  });

  it('C2-04 disables Apply and does not call onApply when the field is empty', { tags: '@component' }, () => {
    const onApply = cy.spy().as('onApply');
    cy.mount(<PromoCodeInput appliedCode={null} onApply={onApply} onRemove={cy.spy()} />);

    cy.findByRole('button', { name: 'Apply' }).then(($el) =>
      expect($el, 'Apply with an empty code').to.be.disabled,
    );

    cy.findByRole('textbox', { name: 'Promo code' }).type('{enter}');
    cy.get('@onApply').should('not.have.been.called');
  });

  it('C2-05 keeps Apply disabled for a whitespace-only code', { tags: '@component' }, () => {
    const onApply = cy.spy().as('onApply');
    cy.mount(<PromoCodeInput appliedCode={null} onApply={onApply} onRemove={cy.spy()} />);

    cy.findByRole('textbox', { name: 'Promo code' }).type('   ');

    cy.findByRole('button', { name: 'Apply' }).then(($el) =>
      expect($el, 'Apply with only spaces').to.be.disabled,
    );
    cy.get('@onApply').should('not.have.been.called');
  });

  it('C2-06 shows the message This code has expired.', { tags: '@component' }, () => {
    cy.mount(
      <PromoCodeInput
        appliedCode={null}
        onApply={cy.spy()}
        onRemove={cy.spy()}
        error="This code has expired."
      />,
    );

    cy.findByText('This code has expired.');
  });

  it('C2-07 disables Apply while a request is in flight', { tags: '@component' }, () => {
    cy.mount(<PromoCodeInput appliedCode={null} busy onApply={cy.spy()} onRemove={cy.spy()} />);

    cy.findByRole('textbox', { name: 'Promo code' }).type('leafy10');
    cy.findByRole('button', { name: 'Apply' }).then(($el) =>
      expect($el, 'Apply while a request is in flight').to.be.disabled,
    );
  });

  it('C2-08 disables Remove while a request is in flight', { tags: '@component' }, () => {
    cy.mount(<PromoCodeInput appliedCode="LEAFY10" busy onApply={cy.spy()} onRemove={cy.spy()} />);

    cy.findByRole('button', { name: 'Remove' }).then(($el) =>
      expect($el, 'Remove while a request is in flight').to.be.disabled,
    );
  });

  it('C2-09 applies leafy10 from the keyboard with the field named Promo code', { tags: '@component' }, () => {
    const onApply = cy.spy().as('onApply');
    cy.mount(<PromoCodeInput appliedCode={null} onApply={onApply} onRemove={cy.spy()} />);

    cy.findByText('Promo code');
    cy.findByRole('textbox', { name: 'Promo code' }).type('leafy10{enter}');
    cy.findByRole('button', { name: 'Apply' });

    cy.get('@onApply').should('have.been.calledOnceWithExactly', 'leafy10');
  });

  it('C2-10 gives Remove an accessible name', { tags: '@component' }, () => {
    cy.mount(<PromoCodeInput appliedCode="LEAFY10" onApply={cy.spy()} onRemove={cy.spy()} />);

    cy.findByRole('button', { name: 'Remove' });
  });

  it('C2-11 announces the expired message with contrast at least 4.5:1', { tags: '@component' }, () => {
    cy.mount(
      <PromoCodeInput
        appliedCode={null}
        onApply={cy.spy()}
        onRemove={cy.spy()}
        error="This code has expired."
      />,
    );

    cy.findByText('This code has expired.').then(($message) => {
      const node = $message[0];
      const announced = node.closest('[role="alert"], [aria-live="assertive"]');
      expect(announced, 'message is inside an alert or assertive live region').to.not.equal(null);

      const fg = window.getComputedStyle(node).color;
      const bg = opaqueBackground(node);
      expect(contrastRatio(fg, bg), 'error text contrast').to.be.at.least(4.5);
    });
  });

  it('C2-12 shows a visible focus outline on the field and on Apply', { tags: '@component' }, () => {
    cy.mount(<PromoCodeInput appliedCode={null} onApply={cy.spy()} onRemove={cy.spy()} />);

    cy.press(Cypress.Keyboard.Keys.TAB);
    cy.findByRole('textbox', { name: 'Promo code' }).then(($field) => {
      assertKeyboardFocusVisible($field, 'Promo code');
    });

    // Apply is omitted from the tab order while it is disabled, so type a code before tabbing to it.
    cy.findByRole('textbox', { name: 'Promo code' }).type('leafy10');
    cy.press(Cypress.Keyboard.Keys.TAB);
    cy.findByRole('button', { name: 'Apply' }).then(($apply) => {
      assertKeyboardFocusVisible($apply, 'Apply');
    });
  });
});
