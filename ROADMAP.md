# Roadmap

Tracked follow-ups, in rough priority order. This is not a committed
schedule; it is a public list of known gaps and open design questions.

Status keys:
- `[open]` — not started
- `[in progress]` — partially implemented
- `[design]` — under discussion, no implementation yet

## Contract

### Migration path (`migrate(lockId, newVault)`) — `[design]`

A bug in v1 severe enough to require a redeploy currently strands every
beneficiary: the contract has no `update`, no admin override, and no escape
hatch. A one-way, opt-in, per-lock migration restores recoverability without
weakening the trust model — beneficiaries decide individually whether to
move to a v2 vault, and the owner has no force-migrate power.

**Sketch:**

```
migrate(int lockId, Hash160 newVault):
  - load lock; require checkWitness(lock.beneficiary)
  - require !lock.revoked && !lock.migrated
  - compute remainingTotal = lock.totalAmount - lock.claimedAmount
  - mark lock.migrated = true
  - rebuild data payload pointing at the new vault, with:
      startTime = now + 1
      endTime   = now + 1 + (lock.endTime - now)   # preserve remaining duration
      cliffTime = max(0, lock.cliffTime - (now - lock.startTime))
      remainingTotal as the amount
      claimedAmount = 0  (only the unclaimed portion is migrated)
  - transferOut(lock.token, newVault, remainingTotal, dataPayload)
  - emit Migrated(lockId, newVault, txHash)
```

**Open design questions:**

- Schedule fidelity: option (a) preserve `startTime` literally and add an
  `acceptMigration` entry-point on the new vault that bypasses the
  future-time check, gated on a trusted-predecessor check (hard to
  authenticate without admin-style state); option (b) reset `startTime` to
  `now+1` and only carry the remaining duration. Option (b) is simpler at
  the cost of slightly different cliff timing.
- Stepped vesting: tranche timestamps in the past must be re-mapped to
  `now+offset`. Migration of stepped locks may be deferred to a later
  version.
- Multi-token vaults: the new vault must already exist and support the
  same NEP-17 token. Whether to validate the target's interface on-chain
  (cross-contract call to `getLockCount`) or trust the beneficiary's choice
  is open.

**Tests required:**

- `migrate_succeeds_preservesRemainingAmount`
- `migrate_byNonBeneficiary_aborts`
- `migrate_alreadyMigrated_aborts`
- `migrate_revokedLock_aborts`
- `migrate_targetIsBogusContract_targetReverts_oldVaultStateUnchanged`
- End-to-end: deploy v1 + v2, create lock in v1, migrate, verify v2 lock is
  claimable on the same effective schedule.

