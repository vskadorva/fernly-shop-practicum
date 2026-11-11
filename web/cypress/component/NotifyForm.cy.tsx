import { NotifyForm } from '../../src/components/NotifyForm';

const THAI_NAME =
  "Variegated Thai Constellation Monstera (Collector's Edition, Limited Greenhouse Batch)";
const CONFIRMATION = "We'll email name@example.com when Chinese Money Plant is back.";

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
  throw new Error('No opaque background behind the text');
}

function assertTextContrast(node: Element, label: string) {
  const ratio = contrastRatio(window.getComputedStyle(node).color, opaqueBackground(node));
  expect(ratio, `${label} contrast`).to.be.at.least(4.5);
}

function assertKeyboardFocusVisible($el: JQuery<HTMLElement>, label: string) {
  expect($el[0], `${label} has keyboard focus`).to.equal(document.activeElement);
  const style = window.getComputedStyle($el[0]);
  expect(style.outlineStyle, `${label} outline style`).to.not.equal('none');
  expect(parseFloat(style.outlineWidth), `${label} outline width`).to.be.greaterThan(0);
}

describe('NotifyForm', () => {
  it("C2 names the email field, submits Notify me, and confirms the address", { tags: '@component' }, () => {
    const onSubmit = cy.spy().as('onSubmit');
    cy.mount(<NotifyForm plantName="Chinese Money Plant" onSubmit={onSubmit} />);

    cy.findByText("Email me when it's back");
    cy.findByRole('textbox', { name: "Email me when it's back" });
    cy.findByRole('button', { name: 'Notify me' });

    cy.findByRole('button', { name: 'Notify me' }).then(($button) => {
      expect($button, 'Notify me with an empty field').to.be.disabled;
    });
    cy.findByRole('textbox', { name: "Email me when it's back" }).type('   ');
    cy.findByRole('button', { name: 'Notify me' }).then(($button) => {
      expect($button, 'Notify me with only spaces').to.be.disabled;
    });
    cy.get('@onSubmit').should('not.have.been.called');

    cy.mount(<NotifyForm plantName="Chinese Money Plant" onSubmit={cy.spy().as('busySubmit')} busy />);
    cy.findByRole('textbox', { name: "Email me when it's back" }).type('name@example.com');
    cy.findByRole('button', { name: 'Notify me' }).then(($button) => {
      expect($button, 'Notify me while busy').to.be.disabled;
    });
    cy.get('@busySubmit').should('not.have.been.called');

    cy.mount(
      <NotifyForm
        plantName="Chinese Money Plant"
        onSubmit={cy.spy()}
        error="You're already on the list"
      />,
    );
    cy.findByRole('alert').then(($alert) => {
      expect($alert.text(), 'error is announced').to.include("You're already on the list");
      assertTextContrast($alert[0], 'error');
    });

    cy.mount(<NotifyForm plantName="Chinese Money Plant" onSubmit={onSubmit} />);
    cy.findByRole('textbox', { name: "Email me when it's back" }).type('  name@example.com  ');
    cy.findByRole('button', { name: 'Notify me' }).click();
    cy.get('@onSubmit').should('have.been.calledOnceWithExactly', 'name@example.com');

    cy.mount(<NotifyForm plantName="Chinese Money Plant" onSubmit={cy.spy().as('shortSubmit')} />);
    cy.findByRole('textbox', { name: "Email me when it's back" }).type('a@b');
    cy.findByRole('button', { name: 'Notify me' }).click();
    cy.get('@shortSubmit').should('have.been.calledOnceWithExactly', 'a@b');

    cy.mount(<NotifyForm plantName="Chinese Money Plant" onSubmit={cy.spy().as('enterSubmit')} />);
    cy.press(Cypress.Keyboard.Keys.TAB);
    cy.findByRole('textbox', { name: "Email me when it's back" }).then(($field) => {
      assertKeyboardFocusVisible($field, 'Email field');
    });
    cy.findByRole('textbox', { name: "Email me when it's back" }).type('name@example.com{enter}');
    cy.get('@enterSubmit').should('have.been.calledOnceWithExactly', 'name@example.com');

    cy.mount(<NotifyForm plantName="Chinese Money Plant" onSubmit={cy.spy()} />);
    cy.findByRole('textbox', { name: "Email me when it's back" }).type('name@example.com');
    cy.press(Cypress.Keyboard.Keys.TAB);
    cy.findByRole('button', { name: 'Notify me' }).then(($button) => {
      assertKeyboardFocusVisible($button, 'Notify me');
    });

    cy.mount(
      <NotifyForm
        plantName="Chinese Money Plant"
        onSubmit={cy.spy()}
        subscribedEmail="name@example.com"
      />,
    );
    cy.findByRole('status').then(($status) => {
      expect($status.text(), 'confirmation names the address and plant').to.equal(CONFIRMATION);
      assertTextContrast($status[0], 'confirmation');
    });
    cy.findByRole('button', { name: 'Notify me' }).should('not.exist');
    cy.findByRole('textbox', { name: "Email me when it's back" }).should('not.exist');

    cy.mount(
      <NotifyForm plantName={THAI_NAME} onSubmit={cy.spy()} subscribedEmail="name@example.com" />,
    );
    cy.findByRole('status').then(($status) => {
      expect($status.text(), 'long plant name keeps the address').to.include('name@example.com');
      expect($status.text(), 'long plant name is shown').to.include(THAI_NAME);
      expect($status[0].scrollWidth, 'confirmation does not clip the address').to.be.at.most(
        $status[0].clientWidth + 1,
      );
    });
  });
});
