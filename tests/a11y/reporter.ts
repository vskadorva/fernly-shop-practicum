import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  FullConfig,
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import type { ImpactValue, Result } from 'axe-core';
import {
  baselineEntryKey,
  classifyViolationElement,
  isBlockingViolation,
  loadBaselineFrom,
  type BaselineEntry,
  type ClassifiedA11yElement,
  type ViolationClassification,
} from './baseline.js';
import type { AxeResultsAttachment } from './helpers/scan.js';

export type A11yReporterOptions = {
  outputFolder?: string;
  baseline?: string;
  title?: string;
};

type ReportElement = ClassifiedA11yElement & {
  url: string;
  screenshotBase64?: string;
  help: string;
  helpUrl: string;
  tags: string[];
};

type ReportRule = {
  id: string;
  impact: ImpactValue;
  help: string;
  helpUrl: string;
  tags: string[];
  elements: ReportElement[];
};

type ReportPage = {
  name: string;
  url: string;
  elementCount: number;
  impactCounts: Record<string, number>;
  rulesPassed: number;
};

type A11yReport = {
  title: string;
  generatedAt: string;
  totals: {
    pagesScanned: number;
    rulesViolated: number;
    elementsAffected: number;
    blocking: number;
  };
  byImpact: Record<string, { new: number; baselined: number; expired: number }>;
  pages: ReportPage[];
  rules: ReportRule[];
  unmatchedBaseline: BaselineEntry[];
  blockingGroups: Array<{
    rule: string;
    page: string;
    count: number;
    exampleSelector: string;
  }>;
};

const IMPACT_ORDER: ImpactValue[] = ['critical', 'serious', 'moderate', 'minor'];
const IMPACT_RANK: Record<string, number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

const __dirname = dirname(fileURLToPath(import.meta.url));

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeMd(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function readAttachmentBody(attachment: TestResult['attachments'][number]): Buffer | null {
  if (attachment.body) {
    return Buffer.isBuffer(attachment.body) ? attachment.body : Buffer.from(attachment.body);
  }
  if (attachment.path) {
    try {
      return readFileSync(attachment.path);
    } catch {
      return null;
    }
  }
  return null;
}

function wcagTags(tags: string[]): string[] {
  return tags.filter((tag) => /^wcag/i.test(tag));
}

function impactSort(a: ImpactValue | null | undefined, b: ImpactValue | null | undefined): number {
  return (IMPACT_RANK[a ?? 'minor'] ?? 99) - (IMPACT_RANK[b ?? 'minor'] ?? 99);
}

function emptyImpactCounts(): Record<string, number> {
  return { critical: 0, serious: 0, moderate: 0, minor: 0 };
}

function bumpClassification(
  byImpact: A11yReport['byImpact'],
  impact: ImpactValue | null | undefined,
  classification: ViolationClassification,
): void {
  const key = impact ?? 'minor';
  if (!byImpact[key]) {
    byImpact[key] = { new: 0, baselined: 0, expired: 0 };
  }
  byImpact[key][classification] += 1;
}

function buildReport(
  title: string,
  baselineEntries: BaselineEntry[],
  pageScans: Array<{
    attachment: AxeResultsAttachment;
    shots: Map<string, string>;
  }>,
): A11yReport {
  const matchedBaselineKeys = new Set<string>();
  const elements: ReportElement[] = [];
  const ruleMeta = new Map<string, Pick<Result, 'help' | 'helpUrl' | 'impact' | 'tags'>>();
  const pages: ReportPage[] = [];

  for (const { attachment, shots } of pageScans) {
    const impactCounts = emptyImpactCounts();
    const shotIndexByRule = new Map<string, number>();

    for (const violation of attachment.violations) {
      ruleMeta.set(violation.id, {
        help: violation.help,
        helpUrl: violation.helpUrl,
        impact: violation.impact,
        tags: violation.tags,
      });

      const ruleImpact = (violation.impact ?? 'minor') as ImpactValue;

      for (const node of violation.nodes) {
        const impact = (node.impact ?? ruleImpact) as ImpactValue;
        if (impact in impactCounts) impactCounts[impact] += 1;

        const classified = classifyViolationElement(
          attachment.page,
          violation.id,
          impact,
          node.target,
          node.html,
          node.failureSummary,
          baselineEntries,
        );

        if (classified.baseline) {
          matchedBaselineKeys.add(baselineEntryKey(classified.baseline));
        }

        const shotIndex = shotIndexByRule.get(violation.id) ?? 0;
        shotIndexByRule.set(violation.id, shotIndex + 1);
        const shotKey = `axe-shot:${attachment.page}:${violation.id}:${shotIndex}`;
        const screenshotBase64 = shots.get(shotKey);

        elements.push({
          ...classified,
          url: attachment.url,
          help: violation.help,
          helpUrl: violation.helpUrl,
          tags: violation.tags,
          screenshotBase64,
        });
      }
    }

    pages.push({
      name: attachment.page,
      url: attachment.url,
      elementCount: attachment.violations.reduce((sum, v) => sum + v.nodes.length, 0),
      impactCounts,
      rulesPassed: attachment.passes.length,
    });
  }

  const byImpact: A11yReport['byImpact'] = {};
  for (const element of elements) {
    bumpClassification(byImpact, element.impact, element.classification);
  }

  const rulesById = new Map<string, ReportRule>();
  for (const element of elements) {
    let rule = rulesById.get(element.rule);
    if (!rule) {
      const meta = ruleMeta.get(element.rule);
      rule = {
        id: element.rule,
        impact: (meta?.impact ?? element.impact) as ImpactValue,
        help: meta?.help ?? element.help,
        helpUrl: meta?.helpUrl ?? element.helpUrl,
        tags: meta?.tags ?? element.tags,
        elements: [],
      };
      rulesById.set(element.rule, rule);
    }
    rule.elements.push(element);
    if (impactSort(element.impact, rule.impact) < 0) {
      rule.impact = element.impact;
    }
  }

  const rules = [...rulesById.values()].sort(
    (a, b) => impactSort(a.impact, b.impact) || a.id.localeCompare(b.id),
  );

  const blocking = elements.filter(isBlockingViolation);
  const blockingMap = new Map<string, { rule: string; page: string; count: number; exampleSelector: string }>();
  for (const item of blocking) {
    const key = `${item.rule}\0${item.page}`;
    const existing = blockingMap.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      blockingMap.set(key, {
        rule: item.rule,
        page: item.page,
        count: 1,
        exampleSelector: item.targetSelector,
      });
    }
  }

  const unmatchedBaseline = baselineEntries.filter(
    (entry) => !matchedBaselineKeys.has(baselineEntryKey(entry)),
  );

  return {
    title,
    generatedAt: new Date().toISOString(),
    totals: {
      pagesScanned: pages.length,
      rulesViolated: rules.length,
      elementsAffected: elements.length,
      blocking: blocking.length,
    },
    byImpact,
    pages,
    rules,
    unmatchedBaseline,
    blockingGroups: [...blockingMap.values()].sort(
      (a, b) => impactSort(
        rulesById.get(a.rule)?.impact,
        rulesById.get(b.rule)?.impact,
      ) || a.rule.localeCompare(b.rule) || a.page.localeCompare(b.page),
    ),
  };
}

function generateSummaryMd(report: A11yReport): string {
  const lines: string[] = [];
  lines.push(`# ${report.title}`);
  lines.push('');
  lines.push(
    `**${report.totals.pagesScanned}** pages scanned · **${report.totals.rulesViolated}** rules violated · **${report.totals.elementsAffected}** elements affected · **${report.totals.blocking}** blocking`,
  );
  lines.push('');

  lines.push('| Impact | New | Baselined | Expired |');
  lines.push('| --- | ---: | ---: | ---: |');
  for (const impact of IMPACT_ORDER) {
    const row = report.byImpact[impact] ?? { new: 0, baselined: 0, expired: 0 };
    lines.push(
      `| ${impact} | ${row.new} | ${row.baselined} | ${row.expired} |`,
    );
  }
  lines.push('');

  if (report.blockingGroups.length === 0) {
    lines.push('No blocking accessibility violations.');
  } else {
    lines.push('## Blocking violations');
    lines.push('');
    lines.push('| Rule | Page | Count | Example selector |');
    lines.push('| --- | --- | ---: | --- |');
    for (const group of report.blockingGroups) {
      lines.push(
        `| ${escapeMd(group.rule)} | ${escapeMd(group.page)} | ${group.count} | \`${escapeMd(group.exampleSelector)}\` |`,
      );
    }
  }
  lines.push('');
  return lines.join('\n');
}

function impactBarSegment(count: number, total: number, impact: string): string {
  if (count === 0 || total === 0) return '';
  const pct = Math.round((count / total) * 100);
  return `<span class="bar-seg bar-${escapeHtml(impact)}" style="width:${pct}%" title="${escapeHtml(impact)}: ${count}"></span>`;
}

function classificationBadge(classification: ViolationClassification): string {
  const cls = `badge badge-${classification}`;
  const label = classification.charAt(0).toUpperCase() + classification.slice(1);
  return `<span class="${cls}">${escapeHtml(label)}</span>`;
}

function generateIndexHtml(report: A11yReport): string {
  const impactFilterCounts: Record<string, number> = emptyImpactCounts();
  const statusCounts = { new: 0, baselined: 0, expired: 0 };
  for (const rule of report.rules) {
    for (const el of rule.elements) {
      const imp = el.impact ?? 'minor';
      if (imp in impactFilterCounts) impactFilterCounts[imp] += 1;
      statusCounts[el.classification] += 1;
    }
  }

  const pageOptions = report.pages
    .map((p) => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`)
    .join('');

  const pagesTableRows = report.pages
    .map((page) => {
      const total = page.elementCount || 1;
      const bar = IMPACT_ORDER.map((impact) =>
        impactBarSegment(page.impactCounts[impact] ?? 0, total, impact),
      ).join('');
      return `<tr>
        <td>${escapeHtml(page.name)}</td>
        <td class="url"><a href="${escapeHtml(page.url)}">${escapeHtml(page.url)}</a></td>
        <td class="num">${page.elementCount}</td>
        <td><div class="impact-bar">${bar || '<span class="bar-empty">—</span>'}</div></td>
        <td class="num">${page.rulesPassed}</td>
      </tr>`;
    })
    .join('\n');

  const ruleCards = report.rules
    .map((rule) => {
      const wcag = wcagTags(rule.tags)
        .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
        .join('');
      const elementsHtml = rule.elements
        .map((el) => {
          const searchBlob = [
            rule.id,
            rule.help,
            el.page,
            el.targetSelector,
            el.html,
            el.failureSummary ?? '',
          ]
            .join(' ')
            .toLowerCase();
          const shot = el.screenshotBase64
            ? `<img class="shot" alt="" src="data:image/png;base64,${el.screenshotBase64}" />`
            : `<div class="shot shot-missing">No screenshot</div>`;
          const baselineMeta =
            el.baseline && el.classification !== 'new'
              ? `<p class="baseline-meta"><strong>${escapeHtml(el.baseline.owner)}</strong> · expires ${escapeHtml(el.baseline.expires)} · ${escapeHtml(el.baseline.reason)}</p>`
              : '';
          return `<article class="element"
            data-impact="${escapeHtml(el.impact ?? 'minor')}"
            data-page="${escapeHtml(el.page)}"
            data-status="${escapeHtml(el.classification)}"
            data-search="${escapeHtml(searchBlob)}">
            <div class="element-top">
              ${classificationBadge(el.classification)}
              <span class="element-page">${escapeHtml(el.page)}</span>
            </div>
            ${shot}
            <p class="selector"><code>${escapeHtml(el.targetSelector)}</code></p>
            <pre class="html-snippet">${escapeHtml(el.html)}</pre>
            ${el.failureSummary ? `<pre class="failure">${escapeHtml(el.failureSummary.trim())}</pre>` : ''}
            ${baselineMeta}
          </article>`;
        })
        .join('\n');

      return `<section class="rule-card" data-impact="${escapeHtml(rule.impact)}" data-rule="${escapeHtml(rule.id)}">
        <header class="rule-header">
          <span class="impact-pill impact-${escapeHtml(rule.impact)}">${escapeHtml(rule.impact)}</span>
          <h2>${escapeHtml(rule.help)}</h2>
          <p class="rule-id"><code>${escapeHtml(rule.id)}</code></p>
          <div class="tags">${wcag}</div>
          <p><a class="fix-link" href="${escapeHtml(rule.helpUrl)}" rel="noopener">How to fix it</a></p>
        </header>
        <div class="elements">${elementsHtml}</div>
      </section>`;
    })
    .join('\n');

  const unmatchedList =
    report.unmatchedBaseline.length === 0
      ? '<p class="muted">All baseline entries matched at least one violation.</p>'
      : `<ul class="unmatched">${report.unmatchedBaseline
          .map(
            (entry) =>
              `<li><code>${escapeHtml(entry.rule)}</code> on <strong>${escapeHtml(entry.page)}</strong> · target <code>${escapeHtml(entry.target)}</code> · ${escapeHtml(entry.owner)} · expires ${escapeHtml(entry.expires)}</li>`,
          )
          .join('')}</ul>`;

  const impactCheckboxes = IMPACT_ORDER.map((impact) => {
    const count = impactFilterCounts[impact] ?? 0;
    return `<label><input type="checkbox" class="filter-impact" value="${impact}" checked /> ${impact} (${count})</label>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(report.title)}</title>
<style>
:root {
  --bg: #0f1419;
  --panel: #1a222c;
  --text: #e7edf4;
  --muted: #8b9aab;
  --line: #2d3a47;
  --critical: #ff5c5c;
  --serious: #ff9f43;
  --moderate: #ffd166;
  --minor: #6ecbff;
  --accent: #7ddf8a;
  --font: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; font-family: var(--font); background: var(--bg); color: var(--text); line-height: 1.45; }
a { color: var(--accent); }
header.page-header { padding: 1.5rem 1.25rem; border-bottom: 1px solid var(--line); background: linear-gradient(180deg, #15202b, var(--bg)); }
header.page-header h1 { margin: 0 0 1rem; font-size: 1.5rem; font-weight: 650; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.75rem; }
.stat { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 0.75rem 1rem; }
.stat .label { color: var(--muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; }
.stat .value { font-size: 1.75rem; font-weight: 700; margin-top: 0.15rem; }
main { max-width: 1200px; margin: 0 auto; padding: 1.25rem; }
section { margin-bottom: 2rem; }
h2.section-title { font-size: 1.1rem; margin: 0 0 0.75rem; }
table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
th, td { border-bottom: 1px solid var(--line); padding: 0.55rem 0.4rem; text-align: left; vertical-align: middle; }
th { color: var(--muted); font-weight: 600; }
td.num { text-align: right; font-variant-numeric: tabular-nums; }
td.url { max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.impact-bar { display: flex; height: 10px; border-radius: 999px; overflow: hidden; background: #243040; min-width: 80px; }
.bar-seg { display: block; height: 100%; }
.bar-critical { background: var(--critical); }
.bar-serious { background: var(--serious); }
.bar-moderate { background: var(--moderate); }
.bar-minor { background: var(--minor); }
.bar-empty { color: var(--muted); font-size: 0.8rem; }
.filters { display: flex; flex-wrap: wrap; gap: 0.75rem 1.25rem; align-items: center; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 0.75rem 1rem; margin-bottom: 1rem; }
.filters label { font-size: 0.88rem; color: var(--muted); display: inline-flex; align-items: center; gap: 0.35rem; }
.filters select, .filters input[type="search"] { background: #111820; color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 0.35rem 0.5rem; }
.rule-card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; margin-bottom: 1rem; overflow: hidden; }
.rule-card.hidden { display: none; }
.rule-header { padding: 1rem 1rem 0.5rem; border-bottom: 1px solid var(--line); }
.rule-header h2 { margin: 0.35rem 0; font-size: 1.05rem; }
.rule-id { margin: 0; color: var(--muted); font-size: 0.85rem; }
.impact-pill { display: inline-block; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.15rem 0.45rem; border-radius: 999px; }
.impact-critical { background: color-mix(in srgb, var(--critical) 25%, transparent); color: var(--critical); }
.impact-serious { background: color-mix(in srgb, var(--serious) 25%, transparent); color: var(--serious); }
.impact-moderate { background: color-mix(in srgb, var(--moderate) 25%, transparent); color: var(--moderate); }
.impact-minor { background: color-mix(in srgb, var(--minor) 25%, transparent); color: var(--minor); }
.tags { display: flex; flex-wrap: wrap; gap: 0.35rem; margin: 0.5rem 0; }
.tag { font-size: 0.72rem; background: #243040; color: var(--muted); padding: 0.15rem 0.4rem; border-radius: 4px; }
.fix-link { font-size: 0.9rem; }
.elements { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 0.75rem; padding: 0.75rem; }
.element { background: #121820; border: 1px solid var(--line); border-radius: 8px; padding: 0.65rem; }
.element.hidden { display: none; }
.element-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem; gap: 0.5rem; }
.element-page { font-size: 0.8rem; color: var(--muted); }
.badge { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; padding: 0.12rem 0.35rem; border-radius: 4px; }
.badge-new { background: #3d2a14; color: var(--serious); }
.badge-baselined { background: #1a3324; color: var(--accent); }
.badge-expired { background: #3d1a1a; color: var(--critical); }
.shot { width: 100%; height: auto; border-radius: 6px; border: 1px solid var(--line); display: block; background: #0a0e12; }
.shot-missing { min-height: 80px; display: grid; place-items: center; color: var(--muted); font-size: 0.8rem; }
.selector { margin: 0.4rem 0 0.25rem; font-size: 0.82rem; word-break: break-all; }
.html-snippet, .failure { margin: 0.35rem 0; padding: 0.45rem; background: #0a0e12; border-radius: 6px; font-size: 0.72rem; overflow-x: auto; white-space: pre-wrap; word-break: break-word; }
.baseline-meta { margin: 0.35rem 0 0; font-size: 0.78rem; color: var(--muted); }
.muted { color: var(--muted); }
.unmatched { margin: 0; padding-left: 1.2rem; }
.unmatched li { margin: 0.35rem 0; }
</style>
</head>
<body>
<header class="page-header">
  <h1>${escapeHtml(report.title)}</h1>
  <div class="stats">
    <div class="stat"><div class="label">Pages scanned</div><div class="value">${report.totals.pagesScanned}</div></div>
    <div class="stat"><div class="label">Rules violated</div><div class="value">${report.totals.rulesViolated}</div></div>
    <div class="stat"><div class="label">Elements affected</div><div class="value">${report.totals.elementsAffected}</div></div>
    <div class="stat"><div class="label">Blocking</div><div class="value">${report.totals.blocking}</div></div>
  </div>
</header>
<main>
  <section>
    <h2 class="section-title">Pages</h2>
    <table>
      <thead><tr><th>Page</th><th>URL</th><th>Elements</th><th>Impact mix</th><th>Rules passed</th></tr></thead>
      <tbody>${pagesTableRows}</tbody>
    </table>
  </section>
  <section>
    <h2 class="section-title">Violations</h2>
    <div class="filters">
      <span>${impactCheckboxes}</span>
      <label>Page <select id="filter-page"><option value="">All pages</option>${pageOptions}</select></label>
      <label>Status <select id="filter-status"><option value="">All</option><option value="new">New (${statusCounts.new})</option><option value="baselined">Baselined (${statusCounts.baselined})</option><option value="expired">Expired (${statusCounts.expired})</option></select></label>
      <label>Search <input type="search" id="filter-search" placeholder="Rule, selector, HTML…" /></label>
    </div>
    <div id="rule-cards">${ruleCards}</div>
  </section>
  <section>
    <h2 class="section-title">Baseline entries with no match (safe to delete)</h2>
    ${unmatchedList}
  </section>
</main>
<script>
(function () {
  const impactBoxes = Array.from(document.querySelectorAll('.filter-impact'));
  const pageSelect = document.getElementById('filter-page');
  const statusSelect = document.getElementById('filter-status');
  const searchInput = document.getElementById('filter-search');

  function activeImpacts() {
    return new Set(impactBoxes.filter(function (cb) { return cb.checked; }).map(function (cb) { return cb.value; }));
  }

  function applyFilters() {
    const impacts = activeImpacts();
    const page = pageSelect.value;
    const status = statusSelect.value;
    const q = (searchInput.value || '').trim().toLowerCase();

    document.querySelectorAll('.rule-card').forEach(function (card) {
      var visibleElements = 0;
      card.querySelectorAll('.element').forEach(function (el) {
        var ok = impacts.has(el.dataset.impact);
        if (page && el.dataset.page !== page) ok = false;
        if (status && el.dataset.status !== status) ok = false;
        if (q && !(el.dataset.search || '').includes(q)) ok = false;
        el.classList.toggle('hidden', !ok);
        if (ok) visibleElements += 1;
      });
      card.classList.toggle('hidden', visibleElements === 0);
    });
  }

  impactBoxes.forEach(function (cb) { cb.addEventListener('change', applyFilters); });
  pageSelect.addEventListener('change', applyFilters);
  statusSelect.addEventListener('change', applyFilters);
  searchInput.addEventListener('input', applyFilters);
})();
</script>
</body>
</html>`;
}

class A11yReporter implements Reporter {
  private options: Required<A11yReporterOptions>;
  private pageScans: Array<{ attachment: AxeResultsAttachment; shots: Map<string, string> }> = [];

  constructor(options: A11yReporterOptions = {}) {
    const root = join(__dirname, '../..');
    this.options = {
      outputFolder: options.outputFolder ?? 'a11y-report',
      baseline: options.baseline ?? 'tests/a11y/a11y-baseline.json',
      title: options.title ?? 'Accessibility report',
    };
    this.options.outputFolder = resolve(root, this.options.outputFolder);
    this.options.baseline = resolve(root, this.options.baseline);
  }

  onBegin(_config: FullConfig): void {
    this.pageScans = [];
  }

  onTestEnd(_test: TestCase, result: TestResult): void {
    let axePayload: AxeResultsAttachment | null = null;
    const shots = new Map<string, string>();

    for (const attachment of result.attachments) {
      if (attachment.name === 'axe-results') {
        const body = readAttachmentBody(attachment);
        if (body) {
          axePayload = JSON.parse(body.toString('utf8')) as AxeResultsAttachment;
        }
      } else if (attachment.name?.startsWith('axe-shot:')) {
        const body = readAttachmentBody(attachment);
        if (body) {
          shots.set(attachment.name, body.toString('base64'));
        }
      }
    }

    if (axePayload) {
      this.pageScans.push({ attachment: axePayload, shots });
    }
  }

  onEnd(_result: FullResult): void {
    if (this.pageScans.length === 0) {
      return;
    }

    const baselineEntries = loadBaselineFrom(this.options.baseline);
    const report = buildReport(this.options.title, baselineEntries, this.pageScans);

    mkdirSync(this.options.outputFolder, { recursive: true });

    const indexPath = join(this.options.outputFolder, 'index.html');
    const summaryPath = join(this.options.outputFolder, 'summary.md');
    const jsonPath = join(this.options.outputFolder, 'results.json');

    writeFileSync(indexPath, generateIndexHtml(report), 'utf8');
    writeFileSync(summaryPath, generateSummaryMd(report), 'utf8');
    writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');

    const { pagesScanned, rulesViolated, elementsAffected, blocking } = report.totals;
    console.log(
      `Accessibility: ${pagesScanned} pages, ${rulesViolated} rules, ${elementsAffected} elements, ${blocking} blocking → ${indexPath}`,
    );
  }
}

export default A11yReporter;
