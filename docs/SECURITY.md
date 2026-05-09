# Security

NeoVest is designed to be small and immutable. This document records the
known limitations, the audit status, and the operational guidance.

## Threat model

The contract is one party (the **depositor**) handing tokens to another (the
**beneficiary**) to be released over time. The vault is a trustless escrow:

- Only the beneficiary can `claim`.
- Only the depositor can `revoke`, and only if the lock was created with
  `revocable: true`.
- The contract itself has no privileged role: no owner, no pauser, no
  upgrader, no destroyer.

## Known limitations

- **No recovery path.** If a depositor sets the wrong beneficiary or the
  wrong schedule, the tokens vest as scheduled to the address recorded —
  there is no override. Verify form inputs carefully before signing.
- **No `update`.** Bug fixes after deployment require a fresh deployment and
  a community-driven migration. This is by design (immutability).
- **NEP-17 only.** NEP-11 (NFTs) and other token standards are not
  supported.
- **No on-chain price oracle.** The "% of supply" figure shown in the UI is
  computed off-chain from the token's `totalSupply()` at view time.
- **Stepped tranches stored as serialized bytes.** The contract trusts that
  the tranche array passed in `data` is well-formed at creation; validation
  is performed once and the serialized bytes are stored. Reads
  re-deserialize.
- **Block timestamp granularity.** Schedule math uses `Runtime.getTime()`
  (the block time), which is approximate to the second. Don't design
  schedules that rely on sub-block precision.

## Audit status

**Unaudited.** This is open-source software with no warranty (see `LICENSE`).
Recommended posture before any non-trivial mainnet use:

1. Review the contract source.
2. Run the test suite (`./gradlew :contract:test`) and read each test.
3. Deploy to testnet and exercise every path with realistic amounts.
4. Have someone independent re-do steps 1–3.
5. Keep initial mainnet deposits small until the contract has lived through
   real activity for a sustained period.

## Operational guidance

- **Pin compiler versions** (`gradle.properties`) so the bytecode is
  reproducible. See `VERIFY.md`.
- **Don't reuse keys.** The deployer key needs only enough GAS to deploy;
  treat it as disposable.
- **Treat each vault as immutable post-deploy.** If you need to change
  parameters, deploy a new vault and migrate.
- **Document the deployment.** A README in your fork pointing at the contract
  hash and tagged source commit makes verification straightforward.

## Reporting issues

For security issues, please contact the maintainers privately — do not open
a public issue until a fix is available.
