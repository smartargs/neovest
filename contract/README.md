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

Both files are inputs to deployment (see `deploy/` and the in-browser
Deploy page, which bundles them via `cd ui && npm run sync`).

## Test

```bash
./gradlew :contract:test
```

Tests run against an embedded Neo node provided by `neow3j-devpack-test`
(Docker is required), allowing chain time to be advanced to verify
schedule math.

## Layout

```
src/main/java/com/smartargs/vesting/
  VestingVault.java           # the contract: storage, onPayment, claim, revoke, reads
  Lock.java                   # serializable Lock struct stored per-position

src/test/java/com/smartargs/vesting/
  VestingVaultTest.java       # behavioural tests, one per reachable abort site
  helpers/TestHelper.java     # chain-setup and FAULT-assertion utilities
  helpers/TestNep17Token.java # well-behaved NEP-17 used for most deposits
  helpers/LyingNep17Token.java      # returns false from contract-originated transfers
  helpers/ReentrantNep17Token.java  # re-enters vault.claim during a payout
  helpers/SpoofingNep17Token.java   # calls onNEP17Payment directly without moving tokens
```

## Design

- **One privileged role: the owner.** Set at deploy time, immutable. Only
  the owner can deposit; the owner can revoke locks created as revocable.
  No pause, no upgrade, no destroy, no fee recipient.
- **Push pattern.** Locks are created via `NEP-17 transfer(from, vault, amount, data)`
  where `data` is the serialized lock parameters. A single transaction.
  The vault verifies the owner's witness inside the callback, so the
  deposit must be signed with a `CustomContracts` scope naming the token
  and the vault.
- **Three schedule types.** Cliff, Linear (with optional cliff), Stepped.
- **Indexed storage.** Three secondary indexes (by beneficiary, depositor,
  token) enable enumeration without an off-chain indexer.

See `../docs/SCHEDULE.md` for the vesting math reference and
`../docs/SECURITY.md` for the threat model and known limitations.
