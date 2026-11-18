#!/usr/bin/env node
/**
 * QA report: deterministic build from test artifacts + FINDINGS.md; publish to PR via gh.
 * Node 22+, no npm dependencies.
 */
import { spawnSync, execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARKER = '<!-- fernly-qa-report -->';
const FINDING_KEY_MARKER = '<!-- qa-finding-key:';

const PATHS = {
  playwrightJson: path.join(ROOT, 'reports/playwright.json'),
  cypressResults: path.join(ROOT, 'web/cypress/results'),
  a11ySummary: path.join(ROOT, 'a11y-report/summary.md'),
  findings: path.join(ROOT, 'FINDINGS.md'),
  outDir: path.join(ROOT, 'qa-report'),
};

const PLAYWRIGHT_PROJECT_ORDER = ['api', 'e2e', 'a11y', 'visual', 'setup'];

const ANSI_RE =
  // eslint-disable-next-line no-control-regex
  /\u001b\[[0-9;]*m|\u001b\][^\u0007]*\u0007|\u001b\][^\u001b\\]*(?:\\|\u001b\\)/g;

function stripAnsi(text) {
  return String(text ?? '').replace(ANSI_RE, '');
}

function firstLine(text) {
  const line = stripAnsi(text).split(/\r?\n/).find((l) => l.trim());
  return line?.trim() ?? '';
}

function slugTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** @returns {Array<{ id: string, title: string, body: string }>} */
function parseFindings(md) {
  const entries = [];
  const re = /^### (F-\d+)\.\s+(.+)$/gm;
  let m;
  const starts = [];
  while ((m = re.exec(md)) !== null) {
    starts.push({ index: m.index, id: m[1], title: m[2].trim() });
  }
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1].index : md.length;
    const slice = md.slice(start.index, end).trim();
    const lines = slice.split(/\r?\n/);
    const bodyLines = lines.slice(1);
    entries.push({
      id: start.id,
      title: start.title,
      body: bodyLines.join('\n').trim(),
    });
  }
  return entries;
}

function readFindingsFile(filePath) {
  if (!existsSync(filePath)) return [];
  return parseFindings(readFileSync(filePath, 'utf8'));
}

const ZERO_SHA = '0000000000000000000000000000000000000000';

function readBaseFindingsTitles(baseRef) {
  const baseSha = env('BASE_SHA');
  if (baseSha && baseSha !== ZERO_SHA) {
    try {
      const raw = execFileSync('git', ['show', `${baseSha}:FINDINGS.md`], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return new Set(readFindingsFileFromString(raw).map((e) => e.title));
    } catch {
      /* fall through to ref */
    }
  }
  if (!baseRef) return new Set();
  try {
    const raw = execFileSync(
      'git',
      ['show', `origin/${baseRef}:FINDINGS.md`],
      { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
    return new Set(readFindingsFileFromString(raw).map((e) => e.title));
  } catch {
    return new Set();
  }
}

function readFindingsFileFromString(md) {
  return parseFindings(md);
}

function emptySuite(name) {
  return {
    name,
    status: 'not run',
    passed: 0,
    failed: 0,
    knownBugs: 0,
    skipped: 0,
    failures: [],
    knownBugItems: [],
  };
}

/** Walk Playwright JSON report and bucket by project name on specs. */
function parsePlaywrightJson(filePath) {
  if (!existsSync(filePath)) {
    return Object.fromEntries(
      PLAYWRIGHT_PROJECT_ORDER.map((p) => [p, emptySuite(p)]),
    );
  }
  const report = JSON.parse(readFileSync(filePath, 'utf8'));
  /** @type {Record<string, ReturnType<typeof emptySuite>>} */
  const byProject = Object.fromEntries(
    PLAYWRIGHT_PROJECT_ORDER.map((p) => [p, { ...emptySuite(p), status: 'ok' }]),
  );

  /** @type {Array<{ project: string, title: string, file: string, line: number, error: string, knownFinding?: string, visual?: boolean, attachments?: string[] }>} */
  const allCases = [];

  function specFilePath(spec) {
    const raw = spec.file ?? '';
    if (!raw) return '';
    return raw.startsWith('tests/') ? raw : `tests/${raw}`;
  }

  function walkSuites(suites, titlePath = []) {
    for (const suite of suites ?? []) {
      const nextPath = suite.title ? [...titlePath, suite.title] : titlePath;
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          const bucket = test.projectName ?? 'e2e';
          if (!byProject[bucket]) {
            byProject[bucket] = {
              ...emptySuite(`Playwright ${bucket}`),
              name: `Playwright ${bucket}`,
              status: 'ok',
            };
          }
          const results = test.results ?? [];
          if (!results.length) continue;

          const result = pickResult(results);
          const status = result.status;
          const annotations = [
            ...(spec.annotations ?? []),
            ...(test.annotations ?? []),
            ...(result.annotations ?? []),
          ];
          const failAnn = annotations.find((a) => a.type === 'fail');
          const failDesc = stripAnsi(failAnn?.description ?? '');
          const findingMatch = failDesc.match(/^(F-\d+):\s*(.+)$/);

          const errors = (result.errors ?? [])
            .map((e) => stripAnsi(e.message ?? e.stack ?? ''))
            .filter(Boolean);
          const errText = errors.join('\n');
          const isVisual =
            bucket === 'visual' || /toHaveScreenshot|screenshot/i.test(errText);

          const file = specFilePath(spec) || test.location?.file || '';
          const line = spec.line ?? test.location?.line ?? 0;

          const row = {
            project: bucket,
            title: spec.title ?? nextPath.join(' › '),
            file,
            line,
            error: firstLine(errText),
            knownFinding: findingMatch
              ? `${findingMatch[1]}: ${findingMatch[2]}`
              : undefined,
            visual: isVisual,
            attachments: (result.attachments ?? []).map(
              (a) => a.name ?? a.path ?? '',
            ),
          };

          if (status === 'skipped') {
            byProject[bucket].skipped += 1;
          } else if (status === 'expected' || (findingMatch && status === 'failed')) {
            byProject[bucket].knownBugs += 1;
            byProject[bucket].knownBugItems.push(row);
          } else if (status === 'passed') {
            byProject[bucket].passed += 1;
          } else if (
            status === 'failed' ||
            status === 'timedOut' ||
            status === 'interrupted'
          ) {
            if (isVisual) {
              byProject[bucket].failed += 1;
              byProject[bucket].failures.push(row);
            } else {
              byProject[bucket].failed += 1;
              byProject[bucket].failures.push(row);
            }
          } else {
            byProject[bucket].passed += 1;
          }
          allCases.push(row);
        }
      }
      walkSuites(suite.suites, nextPath);
    }
  }

  walkSuites(report.suites ?? []);
  for (const p of PLAYWRIGHT_PROJECT_ORDER) {
    if (!byProject[p]) {
      byProject[p] = emptySuite(`Playwright ${p}`);
    } else {
      byProject[p].name = `Playwright ${p}`;
      const used =
        byProject[p].passed +
        byProject[p].failed +
        byProject[p].knownBugs +
        byProject[p].skipped;
      if (used === 0) byProject[p].status = 'not run';
    }
  }
  return { byProject, allCases, report };
}

function pickResult(results) {
  if (!results?.length) return undefined;
  return results[results.length - 1];
}

/** Parse JUnit XML (Cypress mocha-junit-reporter) without dependencies. */
function parseJUnitXml(xml) {
  const cases = [];
  const testcaseRe = /<testcase\b([^>]*)>([\s\S]*?)<\/testcase>/g;
  const fileFromSuites = [...xml.matchAll(/<testsuite\b[^>]*\bfile="([^"]+)"/g)].map(
    (m) => m[1],
  );
  const defaultFile = fileFromSuites.find((f) => f.includes('.cy.')) ?? '';
  let m;
  while ((m = testcaseRe.exec(xml)) !== null) {
    const attrs = m[1];
    const body = m[2];
    const name = attrs.match(/\bname="([^"]*)"/)?.[1] ?? '';
    const classname = attrs.match(/\bclassname="([^"]*)"/)?.[1] ?? '';
    const skipped = /<skipped\b/.test(body);
    const failureMatch = body.match(/<failure[^>]*message="([^"]*)"/);
    const failureBody = body.match(/<failure[^>]*>([\s\S]*?)<\/failure>/);
    const err = failureMatch
      ? firstLine(stripAnsi(decodeXml(failureMatch[1])))
      : failureBody
        ? firstLine(stripAnsi(decodeXml(failureBody[1])))
        : '';
    cases.push({
      classname,
      name,
      skipped,
      failure: Boolean(failureMatch || failureBody),
      error: err,
      file: defaultFile ? `web/${defaultFile}` : guessFileFromClassname(classname),
      line: 0,
    });
  }
  return cases;
}

function decodeXml(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function guessFileFromClassname(classname) {
  const parts = classname.split('.');
  const last = parts[parts.length - 1];
  if (last?.endsWith('.cy.tsx') || last?.endsWith('.cy.ts')) return `cypress/${last}`;
  return classname.replace(/\./g, '/') + '.cy.tsx';
}

function parseCypressResults(dir, suiteLabel) {
  if (!existsSync(dir)) {
    return emptySuite(suiteLabel);
  }
  const files = readdirSync(dir).filter((f) => f.endsWith('.xml'));
  if (!files.length) {
    return emptySuite(suiteLabel);
  }
  const suite = { ...emptySuite(suiteLabel), status: 'ok' };
  for (const file of files) {
    const kind = file.startsWith('component-')
      ? 'Cypress component'
      : file.startsWith('ui-')
        ? 'Cypress UI'
        : null;
    if (kind && kind !== suiteLabel) continue;
    const xml = readFileSync(path.join(dir, file), 'utf8');
    for (const tc of parseJUnitXml(xml)) {
      if (tc.skipped) {
        suite.skipped += 1;
      } else if (tc.failure) {
        suite.failed += 1;
        suite.failures.push({
          title: tc.name,
          file: tc.file.startsWith('cypress/') ? `web/${tc.file}` : tc.file,
          line: tc.line,
          error: tc.error,
        });
      } else {
        suite.passed += 1;
      }
    }
  }
  if (suite.passed + suite.failed + suite.skipped === 0) {
    return emptySuite(suiteLabel);
  }
  return suite;
}

function env(name, fallback = '') {
  return process.env[name]?.trim() || fallback;
}

function buildRunUrls() {
  const repo = env('GITHUB_REPOSITORY');
  const runId = env('GITHUB_RUN_ID');
  const pr = env('PR_NUMBER');
  const runUrl =
    repo && runId
      ? `https://github.com/${repo}/actions/runs/${runId}`
      : '';
  const prUrl =
    repo && pr ? `https://github.com/${repo}/pull/${pr}` : '';
  return { runUrl, prUrl };
}

function buildCommentMd(ctx) {
  const { suites, visualFailures, findings, newFindings, a11yBlock, runUrl, prUrl } =
    ctx;
  const lines = [MARKER, '', '## QA report', ''];
  if (runUrl) {
    lines.push(`[Workflow run](${runUrl})${prUrl ? ` · [Pull request](${prUrl})` : ''}`, '');
  }

  lines.push(
    '| Suite | Passed | Failed | Known bugs | Skipped |',
    '| --- | ---: | ---: | ---: | ---: |',
  );
  for (const s of suites) {
    const label = s.status === 'not run' ? `${s.name} _(not run)_` : s.name;
    if (s.status === 'not run') {
      lines.push(`| ${label} | — | — | — | — |`);
    } else {
      lines.push(
        `| ${s.name} | ${s.passed} | ${s.failed} | ${s.knownBugs} | ${s.skipped} |`,
      );
    }
  }
  lines.push('');

  const hardFails = suites.flatMap((s) =>
    s.failures.map((f) => ({ suite: s.name, ...f })),
  );
  if (hardFails.length) {
    lines.push('### Failed tests', '');
    for (const f of hardFails) {
      const loc = f.file ? `${f.file}:${f.line || 1}` : f.suite;
      lines.push(`- **${f.title}** (\`${loc}\`) — ${f.error || '(no message)'}`);
    }
    lines.push('');
  }

  if (visualFailures.length) {
    lines.push(
      '### Visual changes',
      '',
      '_A person decides: defect, intended, or noise._',
      '',
      'Diff images ship in the **playwright-report** workflow artifact (HTML report attachments).',
      '',
    );
    for (const v of visualFailures) {
      const loc = v.file ? `${v.file}:${v.line || 1}` : v.project;
      lines.push(`- **${v.title}** (\`${loc}\`) — ${v.error || 'Screenshot mismatch'}`);
    }
    lines.push('');
  }

  const known = suites.flatMap((s) => s.knownBugItems ?? []);
  if (known.length) {
    lines.push('### Known bugs (expected failures)', '');
    for (const k of known) {
      const loc = k.file ? `${k.file}:${k.line || 1}` : k.project;
      lines.push(
        `- **${k.knownFinding ?? k.title}** — \`${loc}\`${k.error ? ` — ${k.error}` : ''}`,
      );
    }
    lines.push('');
  }

  if (newFindings.length) {
    lines.push('### New findings', '');
    for (const f of newFindings) {
      lines.push(`- **${f.id}. ${f.title}**`);
    }
    lines.push('');
  }

  if (findings.length) {
    lines.push('<details>', '<summary>All findings in this branch</summary>', '');
    for (const f of findings) {
      lines.push(`- ${f.id}. ${f.title}`);
    }
    lines.push('', '</details>', '');
  }

  if (a11yBlock) {
    lines.push('<details>', '<summary>Accessibility summary</summary>', '', a11yBlock, '', '</details>', '');
  }

  return lines.join('\n');
}

function buildIssuesJson(newFindings, runUrl, prUrl) {
  return newFindings.map((f) => {
    const key = slugTitle(f.title);
    const body = [
      `## ${f.id}. ${f.title}`,
      '',
      f.body,
      '',
      prUrl ? `Pull request: ${prUrl}` : '',
      runUrl ? `Workflow run: ${runUrl}` : '',
      `${FINDING_KEY_MARKER} ${key} -->`,
    ]
      .filter(Boolean)
      .join('\n');
    return {
      title: `${f.id}: ${f.title}`,
      body,
      key,
    };
  });
}

function commandMain() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'build') return buildCommand(rest);
  if (cmd === 'publish') return publishCommand(rest);
  console.error('Usage: node scripts/qa-report.mjs build | publish [--dry-run]');
  process.exit(2);
}

function buildCommand(_args) {
  const baseRef = env('BASE_REF', 'main');
  const sha = env('GITHUB_SHA', execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim());
  const prNumber = env('PR_NUMBER');
  const { runUrl, prUrl } = buildRunUrls();

  const pw = parsePlaywrightJson(PATHS.playwrightJson);
  const cypressComponent = parseCypressResults(PATHS.cypressResults, 'Cypress component');
  const cypressUi = parseCypressResults(PATHS.cypressResults, 'Cypress UI');

  const suites = [
    cypressComponent,
    cypressUi,
    ...PLAYWRIGHT_PROJECT_ORDER.filter((p) => pw.byProject[p]).map((p) => ({
      name: `Playwright ${p}`,
      ...pw.byProject[p],
    })),
  ];

  const visualFailures = suites
    .filter((s) => s.name === 'Playwright visual')
    .flatMap((s) => s.failures);

  const findings = readFindingsFile(PATHS.findings);
  const baseTitles = readBaseFindingsTitles(baseRef);
  const newFindings = findings.filter((f) => !baseTitles.has(f.title));

  let a11yBlock = '';
  if (existsSync(PATHS.a11ySummary)) {
    a11yBlock = readFileSync(PATHS.a11ySummary, 'utf8').trim();
  }

  const commentMd = buildCommentMd({
    suites,
    visualFailures,
    findings,
    newFindings,
    a11yBlock,
    runUrl,
    prUrl,
  });

  const runJson = {
    sha,
    pr: prNumber ? Number(prNumber) : null,
    runUrl,
    time: new Date().toISOString(),
    totals: Object.fromEntries(
      suites.map((s) => [
        s.name,
        {
          passed: s.status === 'not run' ? null : s.passed,
          failed: s.status === 'not run' ? null : s.failed,
          knownBugs: s.status === 'not run' ? null : s.knownBugs,
          skipped: s.status === 'not run' ? null : s.skipped,
          status: s.status,
        },
      ]),
    ),
    failed: suites.reduce((n, s) => n + (s.failed ?? 0), 0),
    knownBugs: suites.reduce((n, s) => n + (s.knownBugs ?? 0), 0),
    visualChanges: visualFailures.length,
    findings: findings.length,
    newFindings: newFindings.length,
  };

  const issuesJson = buildIssuesJson(newFindings, runUrl, prUrl);

  mkdirSync(PATHS.outDir, { recursive: true });
  writeFileSync(path.join(PATHS.outDir, 'comment.md'), commentMd);
  writeFileSync(path.join(PATHS.outDir, 'run.json'), JSON.stringify(runJson, null, 2));
  writeFileSync(path.join(PATHS.outDir, 'issues.json'), JSON.stringify(issuesJson, null, 2));
  console.log(`Wrote ${PATHS.outDir}`);
}

function ghSpawn(args, options = {}) {
  return spawnSync('gh', args, {
    encoding: 'utf8',
    stdio: options.dryRun ? 'pipe' : 'inherit',
    input: options.input,
    ...options,
  });
}

function publishCommand(args) {
  const dryRun = args.includes('--dry-run');
  const repo = env('GITHUB_REPOSITORY');
  const pr = env('PR_NUMBER');
  if (!pr) {
    console.log('No PR_NUMBER — skipping publish (artifact-only run).');
    return;
  }
  if (!repo) {
    console.error('publish requires GITHUB_REPOSITORY');
    process.exit(2);
  }

  const commentPath = path.join(PATHS.outDir, 'comment.md');
  const issuesPath = path.join(PATHS.outDir, 'issues.json');
  if (!existsSync(commentPath)) {
    console.error('Missing qa-report/comment.md — run build first');
    process.exit(2);
  }
  const commentBody = readFileSync(commentPath, 'utf8');
  const issues = existsSync(issuesPath)
    ? JSON.parse(readFileSync(issuesPath, 'utf8'))
    : [];

  const listArgs = [
    'issue',
    'list',
    '--repo',
    repo,
    '--label',
    'qa-finding',
    '--state',
    'all',
    '--json',
    'body',
    '--limit',
    '500',
  ];
  if (dryRun) {
    console.log('[dry-run] gh', listArgs.join(' '));
  }
  const listed = dryRun
    ? { stdout: '[]' }
    : ghSpawn(listArgs, { stdio: 'pipe' });
  if (!dryRun && listed.status !== 0) {
    process.exit(listed.status ?? 1);
  }
  const existingKeys = new Set();
  for (const row of JSON.parse(listed.stdout || '[]')) {
    const keyMatch = row.body?.match(
      new RegExp(`${FINDING_KEY_MARKER}\\s+([\\w-]+)\\s*-->`),
    );
    if (keyMatch) existingKeys.add(keyMatch[1]);
  }

  const viewArgs = ['pr', 'view', pr, '--repo', repo, '--json', 'comments'];
  const viewed = dryRun
    ? { stdout: '{"comments":[]}' }
    : ghSpawn(viewArgs, { stdio: 'pipe' });
  let commentId = null;
  if (viewed.stdout) {
    const data = JSON.parse(viewed.stdout);
    const hit = (data.comments ?? []).find((c) =>
      (c.body ?? '').trimStart().startsWith(MARKER),
    );
    commentId = hit?.id ?? null;
  }

  if (commentId) {
    const patchPayload = JSON.stringify({ body: commentBody });
    const editArgs = [
      'api',
      '--method',
      'PATCH',
      '-H',
      'Accept: application/vnd.github+json',
      `/repos/${repo}/issues/comments/${commentId}`,
      '--input',
      '-',
    ];
    if (dryRun) {
      console.log(`[dry-run] gh ${editArgs.join(' ')}  # ${commentPath}`);
    } else {
      const r = spawnSync('gh', editArgs, {
        input: patchPayload,
        encoding: 'utf8',
        stdio: ['pipe', 'inherit', 'inherit'],
      });
      if (r.status !== 0) process.exit(r.status ?? 1);
    }
  } else {
    const createArgs = ['pr', 'comment', pr, '--repo', repo, '--body-file', commentPath];
    if (dryRun) {
      console.log('[dry-run] gh', createArgs.join(' '));
    } else {
      const r = ghSpawn(createArgs);
      if (r.status !== 0) process.exit(r.status ?? 1);
    }
  }

  for (const issue of issues) {
    if (existingKeys.has(issue.key)) continue;
    const bodyFile = path.join(PATHS.outDir, `issue-${issue.key}.md`);
    writeFileSync(bodyFile, issue.body);
    const createIssueArgs = [
      'issue',
      'create',
      '--repo',
      repo,
      '--title',
      issue.title,
      '--label',
      'qa-finding',
      '--body-file',
      bodyFile,
    ];
    if (dryRun) {
      console.log('[dry-run] gh', createIssueArgs.join(' '));
    } else {
      const r = ghSpawn(createIssueArgs);
      if (r.status !== 0) process.exit(r.status ?? 1);
    }
  }
}

commandMain();
