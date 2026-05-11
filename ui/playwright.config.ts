import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config. `webServer` serves the *production build* via `vite preview`
 * — testing the built bundle is the point: the polyfill / `manualChunks`
 * config in vite.config.ts only fails at runtime, so a green build can
 * still ship a blank page. `npm run preview` assumes `dist/` exists, so
 * run `npm run build` first (the `e2e` npm script does); CI builds in an
 * earlier step. `npm run build` also runs `prebuild` → the NEF sync
 * scripts, which need a compiled contract (`./gradlew :contract:neow3jCompile`).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
