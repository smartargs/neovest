#!/usr/bin/env node
/**
 * Capture documentation screenshots from a running dev server.
 *
 * Usage:
 *   node scripts/screenshots.mjs                   # default base URL http://localhost:5173
 *   BASE_URL=http://localhost:5175 node scripts/screenshots.mjs
 *
 * Outputs to ../docs/screenshots/. Re-run after UI changes; commit the
 * resulting PNGs alongside code changes that affect the dashboard layout.
 */

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '..', '..', 'docs', 'screenshots');
const baseUrl = process.env.BASE_URL ?? 'http://localhost:5173';

const shots = [
  { path: '/',                 name: 'landing.png',       waitFor: '.page-title' },
  { path: '/v/demo',           name: 'dashboard.png',     waitFor: '.stat-grid' },
  { path: '/v/demo/manage',    name: 'manage.png',        waitFor: '.tabs' },
  { path: '/v/demo/lock/1',    name: 'lock-detail.png',   waitFor: '.dl' },
  { path: '/deploy',           name: 'deploy.png',        waitFor: '.card-pad' },
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2, // retina-quality PNGs for README
  colorScheme: 'dark',
});
const page = await context.newPage();

for (const shot of shots) {
  const url = `${baseUrl}${shot.path}`;
  process.stdout.write(`  → ${shot.name.padEnd(20)} (${url})\n`);
  await page.goto(url, { waitUntil: 'networkidle' });
  try {
    await page.waitForSelector(shot.waitFor, { timeout: 5000 });
  } catch {
    process.stdout.write(`    (waited for ${shot.waitFor} but timed out — capturing anyway)\n`);
  }
  // Settle animations / data fetches.
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(outDir, shot.name), fullPage: false });
}

await browser.close();
process.stdout.write(`\nWrote ${shots.length} screenshots to ${outDir}\n`);
