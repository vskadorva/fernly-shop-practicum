#!/usr/bin/env node
/**
 * QA pipeline metrics from GitHub (read-only via gh). Node 22+, no npm dependencies.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PATH = path.join(ROOT, 'docs/QA-METRICS.md');
const MARKER = '<!-- fernly-qa-report -->';
const PLAN_REVIEW_RE = /^Plan review:\s*(\d+)\s*\/\s*(\d+)/i;
const WORKFLOW_FILE = 'pr-triage.yml';

function gh(args, { input } = {}) {
  const result = execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    input,
  });
  return result.trim();
}

function ghJson(args) {
  const text = gh(args);
  return JSON.parse(text || 'null');
}

function ghApiJson(route) {
  return JSON.parse(gh(['api', route]));
}

function resolveRepo() {
  const fromEnv = process.env.GITHUB_REPOSITORY?.trim();
  if (fromEnv) return fromEnv;
  return ghJson(['repo', 'view', '--json', 'nameWithOwner']).nameWithOwner;
}

function isBotLogin(login) {
  if (!login) return true;
  if (login === 'github-actions' || login === 'github-actions[bot]') return true;
  return login.endsWith('[bot]');
}

function bodyStartsWithQAReport(body) {
  return String(body ?? '').trimStart().startsWith(MARKER);
}

function minutesBetween(isoStart, isoEnd) {
  if (!isoStart || !isoEnd) return null;
  const ms = new Date(isoEnd).getTime() - new Date(isoStart).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  return ms / 60_000;
}

function round1(n) {
  if (n == null || Number.isNaN(n)) return null;
  return Math.round(n * 10) / 10;
}

function fmtMin(n) {
  const r = round1(n);
  return r == null ? '—' : String(r);
}

function fmtInt(n) {
  return n == null ? '—' : String(n);
}

function fmtRatio(num, den) {
  if (den == null || den === 0) return '—';
  const pct = (100 * num) / den;
  return `${num}/${den} (${pct.toFixed(1)}%)`;
}

function escapeMdCell(text) {
  return String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/** @param {string} repo @param {number} prNumber */
function fetchIssueComments(repo, prNumber) {
  const out = [];
  let page = 1;
  for (;;) {
    const chunk = ghApiJson(
      `repos/${repo}/issues/${prNumber}/comments?per_page=100&page=${page}`,
    );
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    for (const c of chunk) {
      out.push({
        login: c.user?.login ?? '',
        createdAt: c.created_at,
        body: c.body ?? '',
      });
    }
    if (chunk.length < 100) break;
    page += 1;
  }
  out.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  return out;
}

function parsePlanReview(comments) {
  const human = comments.filter((c) => !isBotLogin(c.login));
  for (let i = human.length - 1; i >= 0; i--) {
    const trimmed = human[i].body.trimStart();
    const m = PLAN_REVIEW_RE.exec(trimmed);
    if (m) {
      return { rowsRight: Number(m[1]), rowsReviewed: Number(m[2]) };
    }
  }
  return { rowsRight: null, rowsReviewed: null };
}

function firstPlanCommentAt(comments) {
  for (const c of comments) {
    if (!isBotLogin(c.login)) continue;
    if (bodyStartsWithQAReport(c.body)) continue;
    return c.createdAt;
  }
  return null;
}

function firstQaReportAt(comments) {
  for (const c of comments) {
    if (bodyStartsWithQAReport(c.body)) return c.createdAt;
  }
  return null;
}

/** @param {string} repo @param {string} branch */
function agentMinutesForBranch(repo, branch) {
  const runs = ghJson([
    'run',
    'list',
    '--repo',
    repo,
    '--workflow',
    WORKFLOW_FILE,
    '--branch',
    branch,
    '--limit',
    '200',
    '--json',
    'status,conclusion,createdAt,updatedAt',
  ]);
  let totalMin = 0;
  for (const run of runs ?? []) {
    if (run.status !== 'completed') continue;
    const d = minutesBetween(run.createdAt, run.updatedAt);
    if (d != null) totalMin += d;
  }
  return round1(totalMin);
}

/** @param {string} repo */
function loadQaFindings(repo) {
  return ghJson([
    'issue',
    'list',
    '--repo',
    repo,
    '--label',
    'qa-finding',
    '--state',
    'all',
    '--limit',
    '500',
    '--json',
    'number,body,state,stateReason',
  ]);
}

function issueLinksToPr(body, repo, prNumber) {
  const text = String(body ?? '');
  const full = `https://github.com/${repo}/pull/${prNumber}`;
  if (text.includes(full)) return true;
  if (new RegExp(`/pull/${prNumber}(?:\\D|$)`).test(text)) return true;
  return false;
}

function findingsForPr(allIssues, repo, prNumber) {
  const linked = (allIssues ?? []).filter((i) =>
    issueLinksToPr(i.body, repo, prNumber),
  );
  const falseAlarms = linked.filter(
    (i) =>
      i.state === 'CLOSED' &&
      String(i.stateReason ?? '').toUpperCase() === 'NOT_PLANNED',
  ).length;
  return { findings: linked.length, falseAlarms };
}

function buildMarkdown(repo, rows) {
  let sumRight = 0;
  let sumReviewed = 0;
  let sumFindings = 0;
  let sumFalse = 0;

  for (const r of rows) {
    if (r.rowsRight != null) sumRight += r.rowsRight;
    if (r.rowsReviewed != null) sumReviewed += r.rowsReviewed;
    sumFindings += r.findings;
    sumFalse += r.falseAlarms;
  }

  const lines = [];
  lines.push('# QA pipeline metrics', '');
  lines.push(
    `Repo: \`${repo}\`. Generated ${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')} by \`node scripts/qa-metrics.mjs\` (read-only; uses \`gh\` only).`,
    '',
  );
  lines.push(
    `**Totals:** routing accuracy = ${fmtRatio(sumRight, sumReviewed)}; false-alarm rate = ${fmtRatio(sumFalse, sumFindings)}.`,
    '',
  );
  lines.push(
    '**Spend:** agent cost is not available in GitHub; see the [Cursor dashboard](https://cursor.com/dashboard) for usage and billing.',
    '',
  );

  lines.push(
    '| PR | Branch | Plan rows (right/reviewed) | Min to first plan comment | Min to first QA report | Agent min (pr-triage) | Findings | False alarms |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |',
  );

  for (const r of rows) {
    const prCell = `[#${r.number}](${r.url})`;
    const planCell =
      r.rowsRight != null && r.rowsReviewed != null
        ? `${r.rowsRight}/${r.rowsReviewed}`
        : '—';
    lines.push(
      `| ${prCell} | ${escapeMdCell(r.branch)} | ${planCell} | ${fmtMin(r.minToPlan)} | ${fmtMin(r.minToQaReport)} | ${fmtMin(r.agentMin)} | ${fmtInt(r.findings)} | ${fmtInt(r.falseAlarms)} |`,
    );
  }

  if (!rows.length) {
    lines.push('| — | — | — | — | — | — | — | — |');
  }

  lines.push('', '## How each number is measured', '');
  lines.push(
    '- **Pull requests:** every open or closed PR with the `plan-approved` label (`gh pr list --label plan-approved --state all`).',
    '- **Plan rows (right/reviewed):** the last issue comment on that PR from a human (non-bot) author whose body starts with `Plan review: N/M`.',
    `- **Min to first plan comment:** minutes from PR \`createdAt\` to the first issue comment by GitHub Actions that is not a QA report (body does not start with \`${MARKER}\`).`,
    `- **Min to first QA report:** minutes from PR \`createdAt\` to the first issue comment whose body starts with \`${MARKER}\`.`,
    `- **Agent min:** sum of wall-clock minutes for completed \`${WORKFLOW_FILE}\` workflow runs on the PR head branch (\`updatedAt − createdAt\` per run).`,
    '- **Findings:** open or closed issues labeled `qa-finding` whose body links to that pull request.',
    '- **False alarms:** those findings that are closed with GitHub state reason **not planned** (`NOT_PLANNED`).',
    '- **Routing accuracy:** Σ plan rows right ÷ Σ plan rows reviewed across labeled PRs.',
    '- **False-alarm rate:** Σ false alarms ÷ Σ findings across labeled PRs.',
    '',
  );

  return `${lines.join('\n')}\n`;
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const repo = resolveRepo();

  const prs = ghJson([
    'pr',
    'list',
    '--repo',
    repo,
    '--label',
    'plan-approved',
    '--state',
    'all',
    '--limit',
    '200',
    '--json',
    'number,title,url,createdAt,headRefName',
  ]);

  const allFindings = loadQaFindings(repo);

  const rows = (prs ?? []).map((pr) => {
    const comments = fetchIssueComments(repo, pr.number);
    const { rowsRight, rowsReviewed } = parsePlanReview(comments);
    const planAt = firstPlanCommentAt(comments);
    const qaAt = firstQaReportAt(comments);
    const { findings, falseAlarms } = findingsForPr(
      allFindings,
      repo,
      pr.number,
    );

    return {
      number: pr.number,
      title: pr.title,
      url: pr.url,
      branch: pr.headRefName,
      rowsRight,
      rowsReviewed,
      minToPlan: round1(minutesBetween(pr.createdAt, planAt)),
      minToQaReport: round1(minutesBetween(pr.createdAt, qaAt)),
      agentMin: agentMinutesForBranch(repo, pr.headRefName),
      findings,
      falseAlarms,
    };
  });

  rows.sort((a, b) => a.number - b.number);

  const md = buildMarkdown(repo, rows);

  if (dryRun) {
    process.stdout.write(md);
    return;
  }

  mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, md, 'utf8');
  console.log(`Wrote ${OUT_PATH} (${rows.length} PR(s))`);
}

main();
