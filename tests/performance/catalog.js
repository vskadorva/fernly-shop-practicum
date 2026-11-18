import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8100';
const SCENARIO = __ENV.SCENARIO || 'smoke';
const SAVE_BASELINE = __ENV.SAVE_BASELINE === '1';

const ENDPOINTS = ['catalog', 'search', 'plant'];
const BASELINE_FILE = 'baseline.json';
const BASELINE_PATH = 'tests/performance/baseline.json';
const PLANT_ID = 'pl-monstera';
const SEARCH_QUERY = 'monstera';

// Placeholder SLO: 3× recorded p95, clamped [50, 300] ms — until perf owners publish real targets.
const MIN_LIMIT_MS = 50;
const MAX_LIMIT_MS = 300;
const LIMIT_MULTIPLIER = 3;

function readBaseline() {
  try {
    return JSON.parse(open(BASELINE_FILE));
  } catch {
    return { p95_ms: {} };
  }
}

function limitFromBaselineP95(p95Ms) {
  if (p95Ms == null || Number.isNaN(p95Ms)) {
    return MAX_LIMIT_MS;
  }
  return Math.min(MAX_LIMIT_MS, Math.max(MIN_LIMIT_MS, LIMIT_MULTIPLIER * p95Ms));
}

const baseline = readBaseline();
const limits = Object.fromEntries(
  ENDPOINTS.map((name) => [name, limitFromBaselineP95(baseline.p95_ms?.[name])]),
);

const scenarioDefs = {
  smoke: {
    executor: 'per-vu-iterations',
    vus: 1,
    iterations: 10,
    exec: 'shopper',
    tags: { scenario: 'smoke' },
  },
  load: {
    executor: 'constant-vus',
    vus: 20,
    duration: '30s',
    exec: 'shopper',
    tags: { scenario: 'load' },
  },
};

if (!scenarioDefs[SCENARIO]) {
  throw new Error(`Unknown SCENARIO "${SCENARIO}". Use smoke or load.`);
}

const durationThresholds = Object.fromEntries(
  ENDPOINTS.map((name) => [`http_req_duration{endpoint:${name}}`, [`p(95)<${limits[name]}`]]),
);

export const options = {
  scenarios: {
    [SCENARIO]: scenarioDefs[SCENARIO],
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    ...durationThresholds,
  },
  summaryTrendStats: ['p(50)', 'p(95)', 'p(99)'],
};

const tag = (endpoint) => ({ tags: { endpoint } });

export function shopper() {
  const catalogRes = http.get(`${BASE_URL}/api/plants`, tag('catalog'));
  check(catalogRes, { 'catalog status 200': (r) => r.status === 200 });

  const searchRes = http.get(
    `${BASE_URL}/api/plants?search=${encodeURIComponent(SEARCH_QUERY)}`,
    tag('search'),
  );
  check(searchRes, { 'search status 200': (r) => r.status === 200 });

  const plantRes = http.get(`${BASE_URL}/api/plants/${PLANT_ID}`, tag('plant'));
  check(plantRes, { 'plant status 200': (r) => r.status === 200 });

  sleep(1);
}

export default shopper;

function metricTrend(data, endpoint) {
  const key = `http_req_duration{endpoint:${endpoint}}`;
  const metric = data.metrics[key] || data.metrics.http_req_duration;
  return metric?.values ?? {};
}

function thresholdPassed(data, endpoint) {
  const key = `http_req_duration{endpoint:${endpoint}}`;
  const metric = data.metrics[key];
  const thresholdEntries = metric?.thresholds;
  if (!thresholdEntries) {
    const p95 = metricTrend(data, endpoint)['p(95)'];
    return p95 != null && p95 < limits[endpoint];
  }
  return Object.values(thresholdEntries).every((t) => t.ok);
}

function formatMs(value) {
  if (value == null) return '—';
  return `${value.toFixed(2)}`;
}

function buildEndpointRows(data) {
  return ENDPOINTS.map((endpoint) => {
    const values = metricTrend(data, endpoint);
    const pass = thresholdPassed(data, endpoint);
    return {
      endpoint,
      p50: values['p(50)'],
      p95: values['p(95)'],
      p99: values['p(99)'],
      limit_ms: limits[endpoint],
      pass,
    };
  });
}

function markdownTable(rows) {
  const lines = [
    `## Catalog perf — ${SCENARIO}`,
    '',
    '| Endpoint | p50 (ms) | p95 (ms) | p99 (ms) | Limit (ms) | Result |',
    '| --- | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const row of rows) {
    lines.push(
      `| ${row.endpoint} | ${formatMs(row.p50)} | ${formatMs(row.p95)} | ${formatMs(row.p99)} | ${row.limit_ms} | ${row.pass ? 'pass' : 'fail'} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}

export function handleSummary(data) {
  const rows = buildEndpointRows(data);
  const table = markdownTable(rows);

  const numbers = {
    scenario: SCENARIO,
    base_url: BASE_URL,
    limits_ms: limits,
    endpoints: Object.fromEntries(
      rows.map((row) => [
        row.endpoint,
        {
          p50_ms: row.p50,
          p95_ms: row.p95,
          p99_ms: row.p99,
          limit_ms: row.limit_ms,
          pass: row.pass,
        },
      ]),
    ),
  };

  const reportBase = `reports/k6/catalog-${SCENARIO}`;
  const outputs = {
    stdout: table,
    [`${reportBase}.md`]: table,
    [`${reportBase}.json`]: JSON.stringify(numbers, null, 2),
  };

  if (SAVE_BASELINE) {
    const p95_ms = Object.fromEntries(rows.map((row) => [row.endpoint, row.p95]));
    outputs[BASELINE_PATH] = JSON.stringify(
      {
        updated: new Date().toISOString(),
        scenario: SCENARIO,
        p95_ms,
      },
      null,
      2,
    );
  }

  return outputs;
}
