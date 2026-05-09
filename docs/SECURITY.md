# Security

NeoVest is intentionally small and immutable. This document records the
threat model, known limitations, audit status, and operational guidance.

## Threat model

The vault is a trustless escrow that holds NEP-17 tokens for one party
(the **beneficiary**) on behalf of another (the **owner**). The contract
has exactly one privileged role:

- **Owner.** Set at deploy time, immutable thereafter. The owner is the
  only address allowed to deposit (create new locks) via NEP-17 `transfer`
  to the vault. The owner can `revoke` locks created with `revocable: true`.
  The owner cannot otherwise modify, withdraw, or upgrade the contract.

Everything else is unprivileged:

- Only the **beneficiary** of a given lock can `claim` against it.
- Read methods (`getLock`, `vestedAmount`, `claimableAmount`, etc.) are
  open to anyone.
- The contract has no admin override, no pause function, no upgrade path,
  no destruction, and no fee recipient.

If the owner key is lost, no further locks can be created in that vault,
but every existing lock continues to work for its beneficiary.

## Known limitations

- **No recovery for misconfigured locks.** If the owner sets the wrong
  beneficiary address or the wrong schedule, the tokens vest as scheduled
  to the address recorded — there is no override. Verify form inputs
  carefully before signing.
- **No update path.** Bug fixes after deployment require a fresh
  deployment. Migration from old to new vault is opt-in and per-lock,
  driven by the beneficiary; see `ROADMAP.md` for the design.
- **NEP-17 only.** NEP-11 (NFTs) and other token standards are not
  supported.
- **No on-chain price oracle.** The "% of supply" figure shown by the UI
  is computed off-chain from the token's `totalSupply()` at view time.
- **Stepped tranches stored as serialized bytes.** The contract validates
  the tranche array once at lock creation and stores the serialized bytes;
  reads re-deserialize.
- **Block-timestamp granularity.** Schedule math uses `Runtime.getTime()`,
  which is approximate to the second. Schedules that rely on sub-block
  precision are not supported.

## Audit status

**Unaudited.** The contract has been reviewed against the public Neo N3
audit corpus at
[`smartargs/neo-sc-audits`](https://github.com/smartargs/neo-sc-audits)
(Lyrebird, GhostMarket, FTW Overlord, GrantShares). Findings applied:

- **Re-entrancy guard.** `claim` and `revoke` reject any invocation with
  `Runtime.getInvocationCounter() != 1`. A malicious token contract cannot
  re-enter the vault during an outbound `transfer` callback.
- **Permission scope narrowed.** The contract is allowed to call
  `transfer` only — not arbitrary methods on external contracts.
- **Mint-as-deposit blocked.** `onPayment` rejects `from == null`, which
  would otherwise create an unrevokable lock from a token mint.
- **Hash inputs validated.** `Hash160.isValid` is applied to every
  hash-typed input (beneficiary, token, owner).
- **Stepped tranches bounded** to 64 entries, capping the per-claim gas
  cost the owner can inflict on a beneficiary.
- **Checks-Effects-Interactions ordering** verified line-by-line in
  `claim`, `revoke`, and `onPayment`. State is persisted before any
  cross-contract call.
- **`Helper.abort(reason)` on every revert path.** Every fault carries a
  `"VV: …"` reason string so wallets can surface useful failure messages.
- **`Contract.call` return value checked.** Both `null` and `false` are
  treated as failure and abort.

### Recommended review process before non-trivial mainnet use

1. Read the contract source and tests; they are intentionally small.
2. Run `./gradlew :contract:test` and read each assertion.
3. Deploy to testnet and exercise every path with realistic amounts.
4. Have an independent reviewer repeat steps 1–3.
5. Commission a paid audit before any mainnet deposit beyond test scale.
6. Keep initial mainnet deposits small until the contract has lived
   through real on-chain activity for a sustained period.

## Operational guidance

- **Pin compiler versions** (`gradle.properties`) so the bytecode is
  reproducible. See `VERIFY.md`.
- **Treat each vault as immutable post-deploy.** Parameter changes require
  a new deployment.
- **Document the deployment.** A README in your fork pointing at the
  contract hash and the source commit makes verification straightforward
  for everyone interacting with the vault.
- **Owner key hygiene.** The owner address is the only privileged role.
  Use a hardware wallet or multi-sig for any vault holding meaningful
  value. Once set, the owner cannot be changed.

## Reporting security issues

Please **do not open a public issue** for security vulnerabilities. Email
the maintainers at the address listed in the repository's GitHub profile,
or use GitHub's private vulnerability reporting feature on the repository.
A maintainer will acknowledge within 72 hours.
