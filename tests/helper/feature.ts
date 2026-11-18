import { readFileSync } from 'node:fs';

export type Example = {
  scenario: string;
  when: string;
  thens: string[];
  /** The Examples row this example came from; empty for a plain Scenario. */
  row: Record<string, string>;
};

type Outline = {
  name: string;
  isOutline: boolean;
  whens: string[];
  thens: string[];
  header: string[] | undefined;
  rows: Record<string, string>[];
};

const STEP = /^(Given|When|Then|And|But|\*)\s+(.*)$/;

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

function fill(step: string, row: Record<string, string>): string {
  return step.replace(/<([^<>]+)>/g, (whole, key: string) => row[key] ?? whole);
}

function toExamples(outline: Outline): Example[] {
  const rows = outline.isOutline ? outline.rows : [{}];
  return rows.map((row) => ({
    scenario: outline.name,
    when: outline.whens.map((step) => fill(step, row)).join(' and '),
    thens: outline.thens.map((step) => fill(step, row)),
    row,
  }));
}

/**
 * Reads a .feature file into one example per Scenario, or one per Examples row of a
 * Scenario Outline, with <placeholders> filled in from the row.
 */
export function readFeature(path: string): Example[] {
  const examples: Example[] = [];
  let current: Outline | undefined;
  let section: 'none' | 'background' | 'scenario' | 'examples' = 'none';
  let lastKeyword: 'Given' | 'When' | 'Then' | undefined;

  const finish = (): void => {
    if (current) examples.push(...toExamples(current));
    current = undefined;
  };

  for (const raw of readFileSync(path, 'utf-8').split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#') || line.startsWith('@')) continue;

    const heading = /^(Feature|Background|Scenario Outline|Scenario Template|Scenario|Example|Examples|Scenarios):\s*(.*)$/.exec(line);
    if (heading) {
      const [, keyword, name] = heading;
      if (keyword === 'Examples' || keyword === 'Scenarios') {
        section = 'examples';
        if (current) current.header = undefined;
        continue;
      }
      finish();
      if (keyword === 'Feature') section = 'none';
      else if (keyword === 'Background') section = 'background';
      else {
        section = 'scenario';
        current = {
          name,
          isOutline: keyword === 'Scenario Outline' || keyword === 'Scenario Template',
          whens: [],
          thens: [],
          header: undefined,
          rows: [],
        };
      }
      lastKeyword = undefined;
      continue;
    }

    if (line.startsWith('|')) {
      if (section !== 'examples' || !current) continue;
      const values = cells(line);
      if (!current.header) {
        current.header = values;
      } else {
        const header = current.header;
        current.rows.push(Object.fromEntries(header.map((key, i) => [key, values[i] ?? ''])));
      }
      continue;
    }

    const step = STEP.exec(line);
    if (step && section === 'scenario' && current) {
      const [, keyword, text] = step;
      if (keyword === 'Given' || keyword === 'When' || keyword === 'Then') lastKeyword = keyword;
      if (lastKeyword === 'When') current.whens.push(text);
      if (lastKeyword === 'Then') current.thens.push(text);
    }
  }
  finish();
  return examples;
}
