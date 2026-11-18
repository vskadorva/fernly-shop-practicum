/**
 * Helper tier report: merge helper-results tier A/B/C JSON into helper-results/report.md
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FEATURE = join(ROOT, 'tests/helper/helper.feature');
const OUT = join(ROOT, 'helper-results/report.md');

const STEP = /^(Given|When|Then|And|But|\*)\s+(.*)$/;

function cells(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

function fill(step, row) {
  return step.replace(/<([^<>]+)>/g, (whole, key) => row[key] ?? whole);
}

/** Feature order: one row key per scenario × example × Then. */
function readFeatureRows() {
  const rows = [];
  let current;
  let section = 'none';
  let lastKeyword;

  const finish = () => {
    if (!current) return;
    const table = current.isOutline ? current.tableRows : [{}];
    for (const row of table) {
      const example = row.phrase ?? current.whens.map((s) => fill(s, row)).join(' and ');
      for (const then of current.thens.map((s) => fill(s, row))) {
        rows.push({ scenario: current.name, example, then });
      }
    }
    current = undefined;
  };

  for (const raw of readFileSync(FEATURE, 'utf-8').split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#') || line.startsWith('@')) continue;

    const heading =
      /^(Feature|Background|Scenario Outline|Scenario Template|Scenario|Example|Examples|Scenarios):\s*(.*)$/.exec(
        line,
      );
    if (heading) {
      const [, keyword, name] = heading;
      if (keyword === 'Examples' || keyword === 'Scenarios') {
        section = 'examples';
        if (current) current.tableHeader = undefined;
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
          tableHeader: undefined,
          tableRows: [],
        };
      }
      lastKeyword = undefined;
      continue;
    }

    if (line.startsWith('|')) {
      if (section !== 'examples' || !current) continue;
      const values = cells(line);
      if (!current.tableHeader) current.tableHeader = values;
      else {
        current.tableRows.push(
          Object.fromEntries(current.tableHeader.map((key, i) => [key, values[i] ?? ''])),
        );
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
  return rows;
}

function rowKey({ scenario, example, then }) {
  return `${scenario}\0${example}\0${then}`;
}

function loadTierEntries(tierLetter) {
  const dir = join(ROOT, 'helper-results', `tier-${tierLetter.toLowerCase()}`);
  const entries = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith('.json')) continue;
    const parsed = JSON.parse(readFileSync(join(dir, name), 'utf-8'));
    if (!Array.isArray(parsed)) throw new Error(`${name}: expected a JSON array`);
    entries.push(...parsed);
  }
  return entries;
}

/** @returns {'pass' | 'fail' | null} — null means this tier did not check the Then. */
function verdict(entry) {
  if (!entry) return null;
  if (entry.result === 'needs judge') return null;
  if (entry.result === 'passed') return 'pass';
  if (entry.result === 'failed') return 'fail';
  throw new Error(`Unknown result "${entry.result}" for ${entry.example} → ${entry.then}`);
}

function formatCell(entry, tier) {
  const v = verdict(entry);
  if (v === null) return '—';
  if (v === 'pass') return 'pass';
  if (tier === 'B' && entry.passRate) return `fail (${entry.passRate})`;
  return 'fail';
}

function mdCell(text) {
  return String(text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function tiersDisagree(byTier) {
  const checked = ['A', 'B', 'C'].map((t) => verdict(byTier[t])).filter((v) => v !== null);
  return checked.length >= 2 && new Set(checked).size > 1;
}

function main() {
  const byKey = new Map();
  for (const tier of ['A', 'B', 'C']) {
    for (const entry of loadTierEntries(tier)) {
      if (entry.tier !== tier) {
        throw new Error(`Expected tier ${tier} in file, got ${entry.tier}`);
      }
      const key = rowKey(entry);
      const row = byKey.get(key) ?? { scenario: entry.scenario, example: entry.example, then: entry.then };
      row[tier] = entry;
      byKey.set(key, row);
    }
  }

  const ordered = readFeatureRows();
  const seen = new Set();
  const tableRows = [];
  for (const r of ordered) {
    const key = rowKey(r);
    seen.add(key);
    tableRows.push(byKey.get(key) ?? r);
  }
  for (const [key, row] of byKey) {
    if (!seen.has(key)) tableRows.push(row);
  }

  let totalFails = 0;
  let disagreeCount = 0;
  const failures = [];
  const disagreeRows = [];

  const lines = ['# Helper tier report', '', `_Generated ${new Date().toISOString()}_`, ''];

  lines.push(
    '| disagree | scenario | example | then | A | B | C |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  );

  for (const row of tableRows) {
    const disagree = tiersDisagree(row);
    if (disagree) {
      disagreeCount += 1;
      disagreeRows.push(row);
    }

    const cols = ['A', 'B', 'C'].map((t) => formatCell(row[t], t));
    for (const t of ['A', 'B', 'C']) {
      const v = verdict(row[t]);
      if (v === 'fail') {
        totalFails += 1;
        failures.push({ tier: t, ...row, entry: row[t] });
      }
    }

    lines.push(
      `| ${disagree ? '**yes**' : ''} | ${mdCell(row.scenario)} | ${mdCell(row.example)} | ${mdCell(row.then)} | ${cols[0]} | ${cols[1]} | ${cols[2]} |`,
    );
  }

  lines.push('');
  lines.push(
    `**Rows:** ${tableRows.length} · **Tier disagreements:** ${disagreeCount} · **Failure cells:** ${totalFails}`,
    '',
  );

  if (disagreeRows.length) {
    lines.push('## Tier disagreements', '');
    for (const row of disagreeRows) {
      lines.push(`### ${row.example}`, '');
      lines.push(`_${row.scenario}_`, '');
      lines.push(`**Then:** ${row.then}`, '');
      for (const t of ['A', 'B', 'C']) {
        lines.push(`- **${t}:** ${formatCell(row[t], t)}`);
      }
      lines.push('');
    }
  }

  lines.push('## Failures and evidence', '');
  if (!failures.length) {
    lines.push('_No failed Then checks in any tier._', '');
  } else {
    let last = '';
    for (const f of failures) {
      const head = `${f.scenario} · ${f.example}`;
      if (head !== last) {
        if (last) lines.push('');
        lines.push(`### ${f.example}`, '', `_${f.scenario}_`, '');
        last = head;
      }
      lines.push(`**Tier ${f.tier}** — ${f.then}`, '');
      lines.push('```text');
      lines.push(f.entry.evidence.trimEnd());
      lines.push('```', '');
    }
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${lines.join('\n')}\n`);
  console.log(`Wrote ${OUT}`);
  console.log(`Disagreements: ${disagreeCount}`);
  if (disagreeRows.length) {
    console.log('\nRows where tiers disagree:');
    for (const row of disagreeRows) {
      const a = formatCell(row.A, 'A');
      const b = formatCell(row.B, 'B');
      const c = formatCell(row.C, 'C');
      console.log(`- ${row.example}`);
      console.log(`  then: ${row.then}`);
      console.log(`  A=${a}  B=${b}  C=${c}`);
    }
  }
}

main();