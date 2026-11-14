import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8100';
const SCENARIO = __ENV.SCENARIO || 'smoke';

// docs/features/popular-plants.md — How fast it must be:
// ~20 shoppers at once; 95% of GET /api/popular and 95% of GET /api/plants within 300 ms; no request fails.
const ENDPOINTS = ['popular', 'catalog'];
const LIMIT_MS = 300;

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
  ENDPOINTS.map((name) => [`http_req_duration{endpoint:${name}}`, [`p(95)<${LIMIT_MS}`]]),
);

export const options = {
  scenarios: {
    [SCENARIO]: scenarioDefs[SCENARIO],
  },
  thresholds: {
    http_req_failed: ['rate==0'],
    checks: ['rate>0.99'],
    ...durationThresholds,
  },
  summaryTrendStats: ['p(50)', 'p(95)', 'p(99)'],
};

const tag = (endpoint) => ({ tags: { endpoint } });

export function shopper() {
  const popularRes = http.get(`${BASE_URL}/api/popular`, tag('popular'));
  check(popularRes, { 'popular status 200': (r) => r.status === 200 });

  const catalogRes = http.get(`${BASE_URL}/api/plants`, tag('catalog'));
  check(catalogRes, { 'catalog status 200': (r) => r.status === 200 });

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
    return p95 != null && p95 < LIMIT_MS;
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
      limit_ms: LIMIT_MS,
      pass,
    };
  });
}

function markdownTable(rows) {
  const lines = [
    `## Popular plants perf — ${SCENARIO}`,
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
    limits_ms: Object.fromEntries(ENDPOINTS.map((name) => [name, LIMIT_MS])),
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

  const reportBase = `reports/k6/popular-plants-${SCENARIO}`;
  return {
    stdout: table,
    [`${reportBase}.md`]: table,
    [`${reportBase}.json`]: JSON.stringify(numbers, null, 2),
  };
}