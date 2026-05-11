import { test, expect, type Page } from '@playwright/test';

/**
 * No-wallet e2e for the read-only surface — which is most of the app:
 *
 *   - the landing page boots in a real browser (the cheapest regression net
 *     for the polyfill / chunking config in vite.config.ts — that config
 *     only fails at runtime);
 *   - the vault-lookup form (the bit we fixed: it verifies a hash is a
 *     deployed contract before navigating) behaves correctly offline;
 *   - the demo vault — a canned dataset, zero RPC — renders the dashboard.
 *
 * Wallet-gated flows (create lock / claim / revoke / deploy) are out of
 * scope: see `ui/README.md` "Testing" for why.
 */

const HASH_INPUT = 'vault contract hash';

// Fail any test that logged an uncaught page error.
function expectNoPageErrors(page: Page): { check: () => void } {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { check: () => expect(errors, 'uncaught page errors').toEqual([]) };
}

test('landing page boots', async ({ page }) => {
  const errs = expectNoPageErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Token vesting on Neo N3.' })).toBeVisible();
  await expect(page.getByPlaceholder(HASH_INPUT)).toBeVisible();
  errs.check();
});

test('lookup: a malformed hash shows an inline error and does not navigate', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder(HASH_INPUT).fill('0xnot-a-valid-hash');
  await page.getByRole('button', { name: 'Open' }).click();
  await expect(page.getByText('Not a valid contract hash. Expected 0x + 40 hex characters.')).toBeVisible();
  await expect(page).not.toHaveURL(/\/v\//);
});

test('lookup: a well-formed but undeployed hash reports "no contract deployed"', async ({ page }) => {
  // Point at a closed port so contractExists() fails fast and deterministically
  // instead of reaching the public default RPC.
  await page.goto('/?rpc=' + encodeURIComponent('http://127.0.0.1:9'));
  await page.getByPlaceholder(HASH_INPUT).fill('0x' + 'a'.repeat(40));
  await page.getByRole('button', { name: 'Open' }).click();
  await expect(page.getByText(/No contract deployed at this hash/)).toBeVisible({ timeout: 15_000 });
  await expect(page).not.toHaveURL(/\/v\//);
});

test('lookup: "demo" opens the demo dashboard (no RPC)', async ({ page }) => {
  const errs = expectNoPageErrors(page);
  await page.goto('/');
  await page.getByPlaceholder(HASH_INPUT).fill('demo');
  await page.getByRole('button', { name: 'Open' }).click();
  await expect(page).toHaveURL(/\/v\/demo$/);
  await expect(page.getByRole('heading', { name: 'Vesting Dashboard' })).toBeVisible();
  await expect(page.locator('.stat-grid')).toBeVisible();
  errs.check();
});

test('the demo vault renders directly from /v/demo', async ({ page }) => {
  const errs = expectNoPageErrors(page);
  await page.goto('/v/demo');
  await expect(page.getByRole('heading', { name: 'Vesting Dashboard' })).toBeVisible();
  await expect(page.locator('.stat-grid')).toBeVisible();
  errs.check();
});
