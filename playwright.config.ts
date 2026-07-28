import { existsSync } from 'node:fs'
import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const evidenceRoot = process.env.E2E_EVIDENCE_DIR ?? path.join(
  process.cwd(), '.harnesskit', 'evidence', 'comprehensive-site-e2e',
)

const configuredExecutable = process.env.E2E_CHROMIUM_EXECUTABLE?.trim()
const executablePath = configuredExecutable && existsSync(configuredExecutable)
  ? configuredExecutable
  : undefined

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  outputDir: path.join(evidenceRoot, 'test-results'),
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(evidenceRoot, 'html-report'), open: 'never' }],
    ['json', { outputFile: path.join(evidenceRoot, 'results.json') }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5000',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'en-US',
    timezoneId: 'UTC',
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      args: [
        '--no-sandbox',
        '--host-resolver-rules=MAP *.localhost 127.0.0.1, EXCLUDE localhost',
      ],
    },
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /\/mobile\//,
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 5'] },
      testMatch: /\/mobile\/.*\.spec\.ts/,
    },
  ],
})
