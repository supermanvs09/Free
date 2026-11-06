// End-to-end tests against the production build (npm run build first).
//   npm run test:e2e
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
// BASE_URL tests an already running server instead.
const BASE = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;
export default defineConfig({
  testDir: 'tests',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  reporter: [['list']],
  retries: 1,
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } }, testMatch: /responsive|navigation|mobile/ },
  ],
  webServer: process.env.BASE_URL ? undefined : { command: `node scripts/serve.mjs ${PORT}`, url: `http://127.0.0.1:${PORT}/healthz`, reuseExistingServer: !process.env.CI },
});
