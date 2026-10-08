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

### How a deposit is authenticated

A NEP-17 `transfer` to the vault ends in a call to the vault's
`onNEP17Payment(from, amount, data)`. That callback only tells the vault
which contract called it; it does not prove that the caller is a real
token or that any tokens moved. Any contract could call
`onNEP17Payment` directly with `from = owner`, report `transfer` success,
and answer `symbol()` with a real token's symbol. The vault therefore
requires `Runtime.checkWitness(owner)` inside the callback before it
records a lock. A deposit the owner never signed is rejected with
`"VV: no owner witness"`.

Two consequences follow:

- **The owner must be a signing account**: a single-sig or multi-sig
  address. A smart contract cannot provide a witness inside another
  contract's callback, so a contract-owned vault could never receive
  deposits. The Deploy page cannot detect this; check the owner address
  before signing.
- **Deposits must be signed with the `CustomContracts` scope** listing the
  token and the vault. `CalledByEntry` is not enough: the token is called
  by the transaction's entry script, but the vault is called by the token,
  which is one hop further than `CalledByEntry` reaches. The dashboard
  sets this scope automatically. Wallets show it as a permission for
  exactly those two contracts; a prompt listing anything else is a reason
  to reject the transaction.

## Known limitations

- **No recovery for misconfigured locks.** If the owner sets the wrong
  beneficiary address or the wrong schedule, the tokens vest as scheduled
  to the address recorded — there is no override. Verify form inputs
  carefully before signing.
- **GAS earned on vested NEO is stranded.** NEO held by the vault earns
  GAS, which the NEO contract pays to the vault whenever its NEO balance
  changes. The vault accepts that payment (it must, or every NEO claim and
  revoke would fault) but records no lock for it and has no withdrawal
  path, so the GAS stays in the contract permanently. Neither the owner
  nor the beneficiary can claim it. The dashboard warns when the token
  being vested is NEO. A permissionless sweep of surplus balances is a
  candidate for a future contract version (see `ROADMAP.md`); deployed
  vaults cannot be upgraded to it.
- **Tokens that arrive without a valid deposit are stranded too.** The
  same `from == null` path applies to any token minted directly to the
  vault. A NEP-17 transfer from a non-owner is rejected and the transfer
  reverts, so ordinary mistaken transfers are safe; mints are not.
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
- **One vault invocation per transaction for `claim` and `revoke`.** Both
  methods abort unless `Runtime.getInvocationCounter() == 1`. The counter
  counts every call into the vault during the transaction, including read
  methods, so a script that calls `claimableAmount` and then `claim`, or
  two `claim`s for different locks, fails with `"VV: re-entry"`. Each
  `claim` or `revoke` must be the only vault call in its transaction. This
  is what blocks a malicious token from re-entering the vault during an
  outbound `transfer`, and it also means another contract cannot compose
  a vault write into a larger script that touches the vault more than
  once. Read methods called on their own are unaffected.

## Audit status

**Unaudited.** The contract has been reviewed against the public Neo N3
audit corpus at
[`smartargs/neo-sc-audits`](https://github.com/smartargs/neo-sc-audits)
(Lyrebird, GhostMarket, FTW Overlord, GrantShares). Findings applied:

- **Deposit witness required.** `onPayment` aborts unless
  `Runtime.checkWitness(from)` holds, so a contract posing as a token
  cannot create locks attributed to the owner. Covered by
  `payment_directCallSpoofingOwner_aborts` and
  `payment_ownerSignedCalledByEntryOnly_aborts`.
- **Re-entrancy guard.** `claim` and `revoke` reject any invocation with
  `Runtime.getInvocationCounter() != 1`. A malicious token contract cannot
  re-enter the vault during an outbound `transfer` callback.
- **Permission scope narrowed.** The contract is allowed to call
  `transfer` only — not arbitrary methods on external contracts.
- **Mint callbacks tolerated, never recorded.** `onPayment` returns
  without effect when `from == null`, which is how the NEO contract
  delivers GAS and how tokens report mints. Nothing a mint delivers can
  become a lock; see the stranded-GAS limitation above for the cost.
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

## Dashboard trust boundary

The dashboard is a static page that reads everything from one RPC node.
The "Verified" badge, the owner check on the create-lock form, and every
amount shown are only as trustworthy as that node.

- The node is chosen at build time (`VITE_NETWORK` / `VITE_RPC_URL`). A
  per-browser override exists only through the `neovest.rpc` localStorage
  key; there is deliberately no URL parameter, so a link cannot point a
  visitor at an attacker's node. While an override is active every page
  shows a red banner naming the endpoint, with a one-click reset.
- A connected wallet must be on the network the build reads. Contract
  hashes are the same on every Neo N3 network, and so are NEO and GAS, so
  a transaction signed by a wallet on the wrong network can execute for
  real there while the page shows another chain's state. When the wallet
  reports a different network (NeoLine chain id, WalletConnect chain
  reference) the dashboard covers the whole page with a blocking dialog
  until the wallet is switched or disconnected, and every write handler
  refuses to submit.
- Before signing a transaction, compare the contract hash in the wallet
  prompt with the hash in the page URL, and the hash in the URL with the
  one published by the project. The dashboard cannot do that for you.
- The production build ships a Content-Security-Policy (as a `<meta>` tag
  and, for hosts that read it, a `_headers` file) that restricts scripts
  to the page's own origin and browser extensions. See `docs/UI.md`.

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
  value. Once set, the owner cannot be changed, and it must be an account
  that can sign (not a contract).

## Reporting security issues

Please **do not open a public issue** for security vulnerabilities. Email
the maintainers at the address listed in the repository's GitHub profile,
or use GitHub's private vulnerability reporting feature on the repository.
A maintainer will acknowledge within 72 hours.
