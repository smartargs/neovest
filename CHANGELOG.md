# Changelog

All notable changes to NeoVest are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Pre-1.0 versions may introduce breaking changes between minor releases.
Once the contract is audited and a v1.0.0 is tagged, deployed contracts
become immutable and only the UI/SDK side of the project will continue
evolving.

## [Unreleased]

### Security

- **Contract:** `onPayment` now requires the owner's witness
  (`Runtime.checkWitness(from)`). Previously any contract could call
  `onNEP17Payment` directly, claim the owner had deposited, and create a
  lock for a token that never moved. Deposits must be signed with the
  `CustomContracts` scope naming the token and the vault; the dashboard
  does this automatically. The owner must be a signing account, not a
  contract. Two tests cover the spoofed-deposit and wrong-scope cases.
- **UI:** the `?rpc=` URL parameter is gone. A link could point the
  dashboard at an attacker's node and have every trust signal, including
  the Verified badge and the owner check, reported by that node. The
  localStorage override remains for debugging and now shows a red banner
  with a reset button on every page while active.
- **UI:** the production build ships a Content-Security-Policy and emits a
  `_headers` file with frame-ancestors, nosniff, referrer and permissions
  policies.

### Added

- Warning on the create-lock form when the token is NEO: GAS earned by NEO
  held in the vault cannot be withdrawn.
- Lock detail lists the individual tranches of a stepped schedule.
- Owner-mismatch warning on the Deploy review step, with the full owner
  and deployer addresses shown instead of truncated ones.

- Browser-based deployment: connect a wallet, click Deploy, sign one
  transaction. Cost is estimated via RPC; the future contract hash is
  computed deterministically before signing.
- Demo vault at `/v/demo` with a canned dataset (Hyperion / HYPR, 29 locks
  across all six categories, varied schedules) for screenshots and
  evaluation without requiring a chain.
- Recently-visited vault history on the landing page, stored in
  `localStorage`. Role badges (owner / depositor / beneficiary) appear next
  to each vault when a wallet is connected.
- NEP-17 token-info read (`useTokenInfo`): symbol, decimals, total supply.
  Drives the "X% of supply" stat on single-token vaults.
- Owner-mismatch warning on the Create Lock form: if the connected wallet
  is not the vault's owner, the form shows the actual owner address and
  disables submission.
- Network banner across the top of the page on testnet and localnet so a
  dev session is never confused with a production session.
- Local-net helper scripts under `localnet/` and a full walkthrough at
  `docs/LOCAL.md` that brings up an AxLabs Neo3 private-net via Docker.
- Vite dev-server proxy at `/__rpc` so the dashboard can talk to local
  RPC nodes that don't emit CORS headers.
- Bundle-checksum verification: the dashboard cross-checks the deployed
  contract's NEF checksum against the source bundled with the UI build,
  surfacing a "Verified" or "Bytecode mismatch" badge.
- Public `CONTRIBUTING.md` and a refreshed README for OSS-readiness.

### Changed

- The contract is now **owner-only** for deposits. The owner address is
  set at deploy time and immutable thereafter; only the owner can create
  new locks. Beneficiary claims and (for revocable locks) owner revokes
  are unchanged.
- Lock display now respects the token's decimals: amounts are rendered as
  whole-token decimals (e.g. `1,111 GAS`) instead of raw on-chain units.
- Demo data is no longer compiled into the production bundle path. The
  hooks short-circuit on `/v/demo` only; real vault routes go straight to
  RPC.

### Fixed

- Dashboard vesting figures for stepped locks are computed from the
  on-chain tranche list instead of assuming four equal steps, and revoked
  locks are shown frozen at their reduced total instead of continuing to
  vest in charts and tables.
- Amounts are carried as exact integers end to end; totals above 2^53 raw
  units no longer lose digits in the display.
- The predicted contract hash on the Deploy review step rendered as a dash
  for every N-address wallet because of a CommonJS `require` left in the
  browser bundle.
- Notes and categories are decoded as UTF-8, and the create-lock form
  validates their on-chain byte limits instead of character counts.
- The create-lock form rejects tranche counts the date range cannot keep
  strictly ascending, which previously surfaced as an opaque on-chain
  fault.
- "Show all locks" on the depositor tab now works; depositor cards show the
  creation date instead of the start date; the positions stat counts the
  categories actually present; the Verified tooltip describes the SHA-256
  check it performs.
- Lock enumeration fetches with bounded concurrency instead of one request
  per lock all at once.
- `ContractParam.ByteArray` is now sent as base64 across all wallet paths,
  matching the dapi spec. Fixes a "Wrong magic" FAULT when deploying via
  NeoLine, and similar failures in createLock.
- `signer.account` is normalized to a 0x-prefixed scripthash before being
  forwarded to NeoLine. NeoLine's internal call rejected N-prefixed
  addresses with an opaque "UNKNOWN" error.
- Predicted contract hash on deploy now reads from the deploy transaction's
  application log (`Deploy` event) instead of a local re-implementation of
  `calcContractHash`. Local prediction drifted from neo-cli's computation
  for some integer encodings.
- Dashboard charts no longer divide by zero when a single cliff lock has
  `start === end` — the timeline range is padded by ±15 days, and the
  donut chart renders a complete ring for single-segment data.
- Owner field on the Deploy page can now be cleared. Auto-fill from the
  connected wallet runs once on mount instead of every render.
- "View detail" buttons on the Manage page navigate to the Lock Detail
  view instead of doing nothing.
- Dashboard table rows are now clickable and navigate to the per-lock
  detail page.
- Past dates are blocked in the Create Lock form via `min` attributes on
  the datetime inputs and a server-side check in `parseLockForm`.
- Calendar picker indicator on `<input type="datetime-local">` is now
  visible in dark mode.

---

This changelog starts from the public-prep cycle. Earlier history is
available in the git log.
