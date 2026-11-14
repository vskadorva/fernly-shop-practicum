import dotenv from 'dotenv';
import { defineConfig, devices } from '@playwright/test';

dotenv.config();

const apiURL = process.env.API_URL ?? 'http://localhost:8100';
const webURL = process.env.WEB_URL ?? 'http://localhost:5173';

const visualProject =
  process.env.CI || process.env.VISUAL
    ? [
        {
          name: 'visual',
          testDir: 'tests/visual',
          testMatch: /.*\.spec\.ts/,
          dependencies: ['setup' as const],
          use: {
            baseURL: webURL,
            ...devices['Desktop Chrome'],
            viewport: { width: 1280, height: 800 },
          },
        },
      ]
    : [];

export default defineConfig({
  testDir: 'tests',
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      maxDiffPixels: 0,
    },
  },
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'reports/playwright.json' }],
    [
      './tests/a11y/reporter.ts',
      {
        outputFolder: 'a11y-report',
        baseline: 'tests/a11y/a11y-baseline.json',
        title: 'Fernly accessibility',
      },
    ],
  ],
  webServer: [
    {
      command: 'npm run start:api',
      url: `${apiURL}/api/health`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run start:web',
      url: webURL,
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    {
      name: 'setup',
      testMatch: /reset\.setup\.ts/,
      use: { baseURL: apiURL },
    },
    {
      name: 'api',
      testMatch: /api\/.*\.spec\.ts/,
      use: { baseURL: apiURL },
      dependencies: ['setup'],
    },
    {
      name: 'e2e',
      testMatch: /e2e\/.*\.spec\.ts/,
      use: { baseURL: webURL },
      dependencies: ['setup'],
    },
    {
      name: 'a11y',
      testMatch: /a11y\/.*\.spec\.ts/,
      use: { baseURL: webURL },
      dependencies: ['setup'],
    },
    ...visualProject,
  ],
});
