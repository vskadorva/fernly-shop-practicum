import { OrderSummary } from '../../src/components/OrderSummary';

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

function isOpaque(color: string): boolean {
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return false;
  const alpha = m[4] === undefined ? 1 : Number(m[4]);
  return alpha >= 1;
}

/** Uses the element's own background, or the nearest opaque ancestor. */
function opaqueBackground(el: Element): string {
  let node: Element | null = el;
  while (node) {
    const bg = window.getComputedStyle(node).backgroundColor;
    if (isOpaque(bg)) return bg;
    node = node.parentElement;
  }
  throw new Error('No opaque background found for discount text');
}

function isDiscountAmount(content: string, element: Element | null): boolean {
  if (!element || !content.includes('−$')) return false;
  return Array.from(element.children).every((child) => !(child.textContent ?? '').includes('−$'));
}

describe('OrderSummary', () => {
  it('C1-01 shows the LEAFY10 discount and the free-shipping hint under $50', { tags: '@component' }, () => {
    cy.mount(
      <OrderSummary
        itemCount={1}
        subtotal={40}
        discount={4}
        promoCode="LEAFY10"
        shipping={6.95}
        total={42.95}
      />,
    );

    cy.findByRole('region', { name: 'Order summary' });
    cy.findByText('Discount (LEAFY10)');
    cy.findByText('−$4.00');
    cy.findByText('$40.00');
    cy.findByText('$6.95');
    cy.findByText('$42.95');
    cy.findByText('Add $10.00 more for free shipping.');
  });

  it('C1-02 omits the discount line when there is no code', { tags: '@component' }, () => {
    cy.mount(
      <OrderSummary
        itemCount={1}
        subtotal={12.5}
        discount={0}
        promoCode={null}
        shipping={6.95}
        total={19.45}
      />,
    );

    cy.findByRole('region', { name: 'Order summary' }).should(($region) => {
      expect($region.text(), 'summary text').not.to.include('Discount');
    });
  });

  it('C1-03 keeps the free-shipping hint one dollar under $50', { tags: '@component' }, () => {
    cy.mount(
      <OrderSummary
        itemCount={1}
        subtotal={49}
        discount={4.9}
        promoCode="LEAFY10"
        shipping={6.95}
        total={51.05}
      />,
    );

    cy.findByText('Discount (LEAFY10)');
    cy.findByText('−$4.90');
    cy.findByText('Add $1.00 more for free shipping.');
  });

  it('C1-04 shows Free shipping at $50 with no discount and no hint', { tags: '@component' }, () => {
    cy.mount(
      <OrderSummary
        itemCount={1}
        subtotal={50}
        discount={0}
        promoCode={null}
        shipping={0}
        total={50}
      />,
    );

    cy.findByRole('region', { name: 'Order summary' }).within(() => {
      cy.findByText('Free');
    });
    cy.findByRole('region', { name: 'Order summary' }).should(($region) => {
      expect($region.text(), 'summary text').not.to.include('Discount');
      expect($region.text(), 'free-shipping hint').not.to.include('more for free shipping');
    });
  });

  it('C1-05 names the summary region with the Paid heading', { tags: '@component' }, () => {
    cy.mount(
      <OrderSummary
        title="Paid"
        itemCount={1}
        subtotal={12.5}
        discount={1.25}
        promoCode="LEAFY10"
        shipping={6.95}
        total={18.2}
      />,
    );

    cy.findByRole('heading', { name: 'Paid' });
    cy.findByRole('region', { name: 'Paid' });
  });

  it('C1-06 names the region from its heading and meets discount contrast', { tags: '@component' }, () => {
    cy.mount(
      <OrderSummary
        itemCount={1}
        subtotal={40}
        discount={4}
        promoCode="LEAFY10"
        shipping={6.95}
        total={42.95}
      />,
    );

    cy.findByRole('heading', { name: 'Order summary' });
    cy.findByRole('region', { name: 'Order summary' });
    cy.findByText(isDiscountAmount).then(($discount) => {
      const node = $discount[0];
      const fg = window.getComputedStyle(node).color;
      const bg = opaqueBackground(node);
      const ratio = contrastRatio(fg, bg);
      expect(ratio, `discount text ${fg} on ${bg}`).to.be.at.least(4.5);
    });
  });
});
