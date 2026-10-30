import { defineConfig } from '@playwright/test';

// UI tests against a running, freshly seeded server (DEMO_MODE=1). Uses the system Chrome.
export default defineConfig({
  testDir: 'tests/ui',
  timeout: 150_000,
  workers: 1,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000', channel: 'chrome', viewport: { width: 1280, height: 860 } },
});
