import { defineConfig } from 'playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['browser.spec.ts'],
  fullyParallel: false,
  workers: 1,
  timeout: 12 * 60_000,
  expect: {
    timeout: 20_000
  },
  retries: 0,

  use: {
    headless: false,
    baseURL: 'http://localhost:5174',
    viewport: { width: 1440, height: 900 },
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    launchOptions: {
      slowMo: 450
    }
  },

  webServer: {
    command: 'docker compose up -d --build && node -e "setInterval(() => {}, 1 << 30)"',
    url: 'http://localhost:5174',
    reuseExistingServer: true,
    timeout: 6 * 60_000
  }
});
