# NeoVest

Trustless token vesting for Neo N3. Self-deployable, immutable contract;
static dashboard SPA that runs against any deployment.

## About

NeoVest is a small, focused tool for projects that issue tokens with vesting
obligations — team allocations, investor lockups, treasury releases,
advisor grants. It exists because most existing solutions either rely on a
centralized operator that can change the rules later, or hide the
distribution behind a custodian where outsiders can't see what's actually
locked.

NeoVest takes the opposite stance:

- **No operator, no admin, no upgrade path.** Each deployed contract is
  immutable. There is no privileged role anywhere in the code.
- **Public by default.** Every lock, schedule, beneficiary, and unlock
  event is readable by anyone with an RPC URL.
- **Self-deployable.** Clone the repo, compile, deploy your own instance,
  point the UI at it. Nothing to subscribe to.
- **Static dashboard.** No backend, no indexer, no servers to keep alive
  for the dashboard to keep working. The UI runs in any browser against
  Neo's RPC.

## How it works

```
                                                ┌──────────────────┐
                                                │  Dashboard SPA   │
                                                │ (read-only view) │
                                                └────────┬─────────┘
                                                         │ Neo RPC
┌──────────────┐    NEP-17 transfer + data    ┌──────────▼─────────┐
│  Depositor   │ ────────────────────────────▶│   VestingVault     │
│  (wallet)    │                              │  (immutable, on    │
└──────────────┘                              │   Neo N3 mainnet)  │
                                              └──────────┬─────────┘
                                                         │  claim()
                                              ┌──────────▼─────────┐
                                              │   Beneficiary      │
                                              │   (wallet)         │
                                              └────────────────────┘
```

1. **Create a lock** — the depositor calls `transfer(vault, amount, data)`
   on a NEP-17 token. The `data` payload encodes the lock parameters
   (beneficiary, schedule type, dates, category, note, revocable flag).
   The vault's `onPayment` callback validates the parameters and creates
   the lock atomically. One transaction. No separate approval step.
2. **Vest over time** — the contract supports three schedule types:
   - **Cliff** — all tokens unlock on a single date.
   - **Linear** — continuous vesting between two dates, with an optional
     cliff that delays the start.
   - **Stepped** — equal tranches at fixed intervals.
3. **Claim** — the beneficiary calls `claim(lockId)`. The contract
   computes `vested - alreadyClaimed`, transfers that amount, and
   updates the state. Anyone can read `vestedAmount` and
   `claimableAmount` at any time without sending a transaction.
4. **Revoke (optional)** — if the lock was created with `revocable: true`,
   the depositor can call `revoke(lockId)` to return the unvested portion.
   The beneficiary keeps the right to claim what already vested.

The full math reference lives in [`docs/SCHEDULE.md`](docs/SCHEDULE.md);
the security model in [`docs/SECURITY.md`](docs/SECURITY.md).

## Screenshots

Dashboard — public read-only view of every lock in a vault, its schedule, and how much has vested.

![Dashboard](https://placehold.co/1280x720/0A0B0D/F4F4F5?text=Dashboard%0AStat+cards+%E2%80%A2+stacked+timeline+%E2%80%A2+allocation+donut+%E2%80%A2+locks+table)

Manage — beneficiaries claim, depositors revoke. Wallet-gated.

![Manage — Beneficiary tab](https://placehold.co/1280x720/0A0B0D/F4F4F5?text=Manage+%E2%80%94+As+Beneficiary%0AClaim+individual+locks+or+claim+all)

Create lock — a single-transaction form with a live preview of the resulting vesting curve.

![Manage — Create lock](https://placehold.co/1280x720/0A0B0D/F4F4F5?text=Manage+%E2%80%94+Create+lock%0AForm+%2B+live+vesting-curve+preview)

> Replace the placeholders above with real screenshots in `docs/screenshots/`
> once you have a populated deployment to capture.

## Layout

```
contract/   neow3j Java smart contract (VestingVault)
deploy/     deployment scripts (neo-express + mainnet)
ui/         Vite + React + TypeScript dashboard
docs/       DEPLOY, VERIFY, SCHEDULE, SECURITY, UI
```

## Quickstart

UI:

```
cd ui
npm install
npm run dev
```

Contract:

```
./gradlew :contract:test
./gradlew :contract:neow3jCompile
```

Deploy locally (neo-express):

```
./gradlew :deploy:run -PmainClass=com.smartargs.vesting.deploy.DeployLocal
```

Deploy to mainnet:

```
DEPLOYER_WIF=<wif> NEO_RPC=<rpc-url> ./gradlew :deploy:run
```

## Documentation

- [`docs/LOCAL.md`](docs/LOCAL.md) — end-to-end local testing with a private Neo3 net
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — compile, test, deploy
- [`docs/VERIFY.md`](docs/VERIFY.md) — confirm a deployed contract matches this source
- [`docs/SCHEDULE.md`](docs/SCHEDULE.md) — vesting math reference
- [`docs/SECURITY.md`](docs/SECURITY.md) — known limitations, audit status
- [`docs/UI.md`](docs/UI.md) — host and customize the dashboard

## Disclaimer

Provided as-is, no warranty. The authors do not operate any deployed
instance. Audit before depositing real value — locked tokens cannot be
recovered if a contract is deployed incorrectly.

## License

[MIT](LICENSE).
