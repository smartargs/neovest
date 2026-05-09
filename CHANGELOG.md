# Changelog

All notable changes to NeoVest are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Pre-1.0 versions may introduce breaking changes between minor releases.
Once the contract is audited and a v1.0.0 is tagged, deployed contracts
become immutable and only the UI/SDK side of the project will continue
evolving.

## [Unreleased]

### Added

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
