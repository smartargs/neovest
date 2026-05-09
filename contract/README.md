# `contract/` — VestingVault

The on-chain Neo N3 smart contract, written in Java with the
[neow3j devpack](https://neow3j.io/).

## Build

```bash
./gradlew :contract:neow3jCompile
```

Produces:

- `build/neow3j/VestingVault.nef` — bytecode
- `build/neow3j/VestingVault.manifest.json` — ABI manifest

Both files are inputs to deployment (see `deploy/`).

## Test

```bash
./gradlew :contract:test
```

Tests run against an embedded Neo node provided by `neow3j-devpack-test`,
allowing chain time to be advanced to verify schedule math.

## Layout

```
src/main/java/io/yourorg/vesting/
  VestingVault.java   # the contract: storage, onPayment, claim, revoke, reads
  Lock.java           # serializable Lock struct stored per-position

src/test/java/io/yourorg/vesting/
  VestingVaultTest.java       # behavioural tests
  ScheduleMathTest.java       # pure-math tests for vested/claimable
  helpers/TestNep17Token.java # mock NEP-17 token used in tests
```

## Design

- **No owner.** No `onlyOwner`, no pause, no upgrade, no destroy.
- **Push pattern.** Locks are created via `NEP-17 transfer(from, vault, amount, data)`
  where `data` is the serialized lock parameters. A single transaction.
- **Three schedule types.** Cliff, Linear (with optional cliff), Stepped.
- **Indexed storage.** Three secondary indexes (by beneficiary, depositor,
  token) enable enumeration without an off-chain indexer.

See `../docs/SCHEDULE.md` for the vesting math reference and
`../VESTING_PROJECT_PLAN.md` for the full design.
