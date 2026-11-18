import { PriceTag } from '../../src/components/PriceTag';

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

describe('PriceTag', () => {
  it('PT-01 shows $12.50 for amount 12.5', { tags: '@component' }, () => {
    cy.mount(<PriceTag amount={12.5} />);
    cy.findByText('$12.50');
  });

  it('PT-02 shows $50.00 for amount 50', { tags: '@component' }, () => {
    cy.mount(<PriceTag amount={50} />);
    cy.findByText('$50.00');
  });

  it('PT-03 shows $24.99 for amount 24.99', { tags: '@component' }, () => {
    cy.mount(<PriceTag amount={24.99} />);
    cy.findByText('$24.99');
  });

  it('PT-04 shows $0.00 for amount 0', { tags: '@component' }, () => {
    cy.mount(<PriceTag amount={0} />);
    cy.findByText('$0.00');
  });

  it('PT-05 shows $0.01 for amount 0.01', { tags: '@component' }, () => {
    cy.mount(<PriceTag amount={0.01} />);
    cy.findByText('$0.01');
  });

  it('PT-06 shows $6.95 for amount 6.95', { tags: '@component' }, () => {
    cy.mount(<PriceTag amount={6.95} />);
    cy.findByText('$6.95');
  });

  it('PT-07 shows $0.30 for floating-point sum 0.1 + 0.2', { tags: '@component' }, () => {
    cy.mount(<PriceTag amount={0.1 + 0.2} />);
    cy.findByText('$0.30');
  });

  it('PT-11 announces Subtotal before the price for screen readers', { tags: '@component' }, () => {
    cy.mount(<PriceTag amount={12.5} label="Subtotal" />);
    cy.findByText('$12.50').should(($price) => {
      expect($price.parent().text(), 'accessible text includes label').to.eq('Subtotal: $12.50');
    });
  });

  it('PT-12 shows only the price with no label prefix', { tags: '@component' }, () => {
    cy.mount(<PriceTag amount={12.5} />);
    cy.findByText('$12.50').should(($el) => {
      expect($el.text()).to.eq('$12.50');
    });
  });

  it('PT-13 treats empty label like no label', { tags: '@component' }, () => {
    cy.mount(<PriceTag amount={12.5} label="" />);
    cy.findByText('$12.50').should(($el) => {
      expect($el.text()).to.eq('$12.50');
    });
  });

  it('PT-14 uses md size when size is omitted', { tags: '@component' }, () => {
    cy.mount(
      <div>
        <span data-cy="default">
          <PriceTag amount={12.5} />
        </span>
        <span data-cy="md">
          <PriceTag amount={12.5} size="md" />
        </span>
      </div>,
    );

    cy.get('[data-cy="default"] span')
      .invoke('css', 'font-size')
      .then((defaultSize) => {
        cy.get('[data-cy="md"] span')
          .invoke('css', 'font-size')
          .should('eq', defaultSize);
      });
  });

  it('PT-15 increases font size from sm to md to lg', { tags: '@component' }, () => {
    cy.mount(
      <div>
        <span data-cy="sm">
          <PriceTag amount={12.5} size="sm" />
        </span>
        <span data-cy="md">
          <PriceTag amount={12.5} size="md" />
        </span>
        <span data-cy="lg">
          <PriceTag amount={12.5} size="lg" />
        </span>
      </div>,
    );

    const fontSizePx = (selector: string) =>
      cy.get(selector).invoke('css', 'font-size').then((size) => parseFloat(String(size)));

    fontSizePx('[data-cy="sm"] span').then((sm) => {
      fontSizePx('[data-cy="md"] span').then((md) => {
        fontSizePx('[data-cy="lg"] span').then((lg) => {
          expect(sm, 'sm smaller than md').to.be.lessThan(md);
          expect(md, 'md smaller than lg').to.be.lessThan(lg);
        });
      });
    });
  });

  it('PT-16 meets contrast on page background for each size', { tags: '@component' }, () => {
    const sizes = ['sm', 'md', 'lg'] as const;

    sizes.forEach((size) => {
      cy.mount(
        <div data-cy="surface" style={{ background: '#f6faf3', padding: '8px' }}>
          <PriceTag amount={12.5} size={size} />
        </div>,
      );

      cy.get('[data-cy="surface"] span')
        .first()
        .then(($price) => {
          const fg = window.getComputedStyle($price[0]).color;
          const bg = window.getComputedStyle($price[0].parentElement!).backgroundColor;
          const ratio = contrastRatio(fg, bg);
          const minRatio = size === 'lg' ? 3 : 4.5;
          expect(ratio, `${size} contrast on #f6faf3`).to.be.at.least(minRatio);
        });
    });
  });
});
