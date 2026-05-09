# Roadmap

Tracked follow-ups, in priority order. Nothing here is committed schedule —
this is a list of known holes and open design questions.

## Contract

### 1. Migration path (`migrate(lockId, newVault)`) — high priority

A bug in v1 that's bad enough to require a redeploy currently strands every
beneficiary: the contract has no `update`, no admin override, and no
escape hatch. A one-way, opt-in, per-lock migration would fix this without
weakening the trust model — beneficiaries decide individually whether to
move to a v2 vault, and the team has no force-migrate power.

**Sketch:**

```
migrate(int lockId, Hash160 newVault):
  - load lock; require checkWitness(lock.beneficiary)
  - require !lock.revoked && !lock.migrated
  - compute vestedAtMigrate = computeVested(lock)
  - compute remainingTotal = lock.totalAmount - lock.claimedAmount
  - mark lock.migrated = true (new flag, similar to revoked)
  - rebuild data payload pointing at the new vault, with:
      startTime = now + 1
      endTime   = now + 1 + (lock.endTime - now)   # preserve remaining duration
      cliffTime = max(0, lock.cliffTime - (now - lock.startTime))
      remainingTotal as the amount
      claimedAmount = 0  (no carry-over needed; we only transfer what's left)
  - transferOut(lock.token, newVault, remainingTotal, dataPayload)
  - fire Migrated(lockId, newVault, txHash)
```

**Open design questions:**

- Schedule fidelity: option (a) preserve `startTime` literally and add an
  `acceptMigration` entry-point on the new vault that bypasses the
  future-time check, gated on the caller being a trusted predecessor (which
  is hard to authenticate without admin-style state); option (b) reset
  `startTime` to `now+1` and only carry the remaining duration. (b) is
  simpler and avoids the auth problem at the cost of slightly different
  cliff timing — worth taking.
- Stepped vesting: tranche timestamps in the past would need re-mapping to
  `now+offset`. Migration of stepped locks is more involved — consider
  punting to v3.
- Multi-token vaults: the new vault must already exist and support the same
  NEP-17 token; contract should validate `Contract.call(newVault, "getLockCount", ...)`
  to confirm the target is a real VestingVault (or skip and trust the
  beneficiary's choice).

**Tests required:**

- `migrate_succeeds_preservesRemainingAmount`
- `migrate_byNonBeneficiary_aborts`
- `migrate_alreadyMigrated_aborts`
- `migrate_revokedLock_aborts`
- `migrate_targetIsBogusContract_targetReverts_oldVaultStateUnchanged`
- End-to-end: deploy v1 + v2, create lock in v1, migrate, verify v2 lock is
  claimable on the same schedule.

Estimated work: ~50 lines of contract code + 6 tests.

### 2. Pause deposit-only path

If a bug is discovered after deploy, the team can't stop *new* locks from
being created (everything is unstoppable, intentionally). Adding a
`paused` flag on the deposit path only — `claim` and `revoke` continue
to work for existing locks — is a low-risk way to limit blast radius.
Requires an admin role, which is otherwise the thing we explicitly don't
have. Consider only if the audit reveals real risk; default is to ship
without.

## UI

### 4. Create Lock form — wire to `createLock()`

Form fields render but submit is a no-op. Needs:

- Date pickers (start / end / cliff) → unix seconds.
- Beneficiary input → Hash160 validation, address ↔ scripthash conversion.
- Amount → token decimals → smallest-unit `bigint`.
- Stepped tranche editor (add row / remove row / amounts must sum to total).
- Network-fee preview via `NeonInvoker.calculateFee`.
- Submit → `transactions.createLock(provider, args)` → toast + invalidate
  `allLocks` query.

### 5. Bundle code-splitting

Current production bundle: **868 KB gzipped**, target **300 KB**. AppKit +
neon-dappkit + neon-event-listener account for ~700 KB.

Strategy: lazy-load the wallet/transaction stack via `React.lazy` so it
only ships when the user navigates to `/manage` or `/v/:hash/lock/:id`.
The dashboard view (read-only) should fit comfortably under 300 KB on its
own.

### 6. Dashboard table search + filter

Search input and the two `<select>` filters render but don't filter the
locks. Quick wire-up: filter `sortedLocks` by:
- Search query (matches beneficiary address or `note`).
- Selected category (or "All categories").
- Selected schedule type (or "All schedules").

### 7. Loading skeletons / error states / empty states

Currently the Dashboard shows "Loading vault data…" plain text. The UI
should:
- Render skeletons for stat cards, timeline chart, and table rows during
  `isLoading`.
- Surface RPC errors with a retry button instead of a blank page.
- Show "No locks created yet" with a CTA to the Manage > Create flow when
  the vault is empty.

### 8. Token metadata fetcher

Token symbol, decimals, and total-supply are currently hardcoded as the
demo `TOKEN` constant. For real deployments, fetch each unique
`lock.token` via NEP-17 standard methods (`symbol`, `decimals`,
`totalSupply`) and cache in localStorage. Drives the token selector UI
when a vault holds multiple tokens.

## Tooling

### 9. End-to-end test against a deployed vault

The contract test suite exercises NeoVM-level behavior. A separate Playwright
suite that deploys a vault to neo-express, opens the UI against it, and
walks through deposit → claim → revoke flows would catch RPC-decoder bugs
the contract suite can't see.

### 10. CI

GitHub Actions workflow:
- `./gradlew :contract:test` (Docker / neo-express via service container)
- `cd ui && npm run typecheck && npm run build`
- Bundle-size check (fail if main chunk > 1 MB pre-gzip).
