import { StockBadge } from '../../src/components/StockBadge';

function parseRgb(color: string): [number, number, number] {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) {
    throw new Error(`Unsupported color: ${color}`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(fg: string, bg: string): number {
  const [fr, fgG, fb] = parseRgb(fg);
  const [br, bgG, bb] = parseRgb(bg);
  const lighter = Math.max(relativeLuminance(fr, fgG, fb), relativeLuminance(br, bgG, bb));
  const darker = Math.min(relativeLuminance(fr, fgG, fb), relativeLuminance(br, bgG, bb));
  return (lighter + 0.05) / (darker + 0.05);
}

function opaqueBackground(el: Element): string {
  let current: Element | null = el;
  while (current) {
    const bg = window.getComputedStyle(current).backgroundColor;
    const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (match && bg !== 'transparent') {
      const alpha = match[4] === undefined ? 1 : Number(match[4]);
      if (alpha > 0) return `rgb(${match[1]}, ${match[2]}, ${match[3]})`;
    }
    current = current.parentElement;
  }
  throw new Error('No opaque background behind the badge');
}

describe('StockBadge', () => {
  it('C1 shows Only N left for 1, 2 or 3 and nothing at 0 or above 3', { tags: '@component' }, () => {
    cy.mount(<StockBadge stock={1} />);
    cy.findByText('Only 1 left').then(($badge) => {
      expect($badge[0].tagName, 'badge is real text').to.not.equal('IMG');
      expect($badge[0].getAttribute('role'), 'badge is not an image').to.not.equal('img');
      const fg = window.getComputedStyle($badge[0]).color;
      const ratio = contrastRatio(fg, opaqueBackground($badge[0]));
      expect(ratio, 'Only 1 left contrast').to.be.at.least(4.5);
    });

    cy.mount(<StockBadge stock={2} />);
    cy.findByText('Only 2 left');

    cy.mount(<StockBadge stock={3} />);
    cy.findByText('Only 3 left');

    cy.mount(<StockBadge stock={4} />);
    cy.get('[data-cy-root]').then(($root) => {
      expect($root.text().trim(), 'stock 4 renders nothing').to.equal('');
    });

    cy.mount(<StockBadge stock={20} />);
    cy.get('[data-cy-root]').then(($root) => {
      expect($root.text().trim(), 'stock 20 renders nothing').to.equal('');
    });

    cy.mount(<StockBadge stock={0} />);
    cy.get('[data-cy-root]').then(($root) => {
      expect($root.text(), 'stock 0 never says Only 0 left').to.not.include('Only 0 left');
      expect($root.text().trim(), 'stock 0 renders nothing').to.equal('');
    });
  });
});
