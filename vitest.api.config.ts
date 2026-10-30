import { defineConfig } from 'vitest/config';
import path from 'node:path';

// HTTP-level tests against a running server: E2E_BASE_URL=http://localhost:3000 npm run test:api
export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname) } },
  test: { include: ['tests/e2e/**/*.test.ts'], testTimeout: 30000, fileParallelism: false },
});
