import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Unit tests only — pure logic in src/lib with the RPC layer mocked. No
// network, no chain, no browser. Browser-level coverage lives in the
// Playwright suite (e2e/), which Vitest deliberately does not pick up.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
