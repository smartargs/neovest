# Running NeoVest locally

End-to-end walkthrough: spin up a local Neo N3 chain, deploy the vault, and
exercise the dashboard + claim/revoke flows from a real wallet — all without
touching a public network.

## Prerequisites

- **Docker** (with Compose)
- **Java 17+** + **Gradle** (the project ships a wrapper, so `./gradlew` works)
- **Node 18+** + **npm**
- **NeoLine browser extension** (https://neoline.io) — supports custom RPC
  endpoints, which is what we use for local-net testing.

## 1. Start the local Neo N3 chain

We use [`AxLabs/neo3-privatenet-docker`](https://github.com/AxLabs/neo3-privatenet-docker) — a
3-node private-net (1 consensus, 2 clients) in Docker, with three
documented test wallets and stable RPC ports.

```bash
./localnet/start.sh
```

That script clones the AxLabs repo into `localnet/.chain/` (gitignored) on
first run, then `docker compose up -d`.

When it's up, the exposed RPC ports are:

| Node | RPC URL |
|---|---|
| **client1** (default for the UI) | `http://localhost:10332` |
| client2 | `http://localhost:20332` |
| consensus | `http://localhost:40332` |

Confirm blocks are advancing:

```bash
curl -s -X POST http://localhost:10332 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getblockcount","params":[]}'
```

## 2. Test wallets (from the AxLabs README)

The privatenet ships with three pre-configured wallets. Password for all of
them: **`neo`**.

| Role | Address | WIF |
|---|---|---|
| consensus (multi-sig) | `NXXazKH39yNFWWZF5MJ8tEN98VYHwzn7g3` | `L1eV34wPoj9weqhGijdDLtVQzUpWGHszXXpdU9dPuh2nRFFzFa7E` |
| **client1** | `NdihqSLYTf1B1WYuzhM52MNqvCNPJKLZaz` | `L3cNMQUSrvUrHx1MzacwHiUeCWzqK2MLt5fPvJj9mz6L2rzYZpok` |
| client2 | `NhJX9eCbkKtgDrh1S4xMTRaHUGbZ5Be7uU` | `L1RgqMJEBjdXcuYCMYB6m7viQ9zjkNPjZPAKhhBoXxEsygNXENBb` |

The consensus account holds the entire NEO + GAS supply at genesis; client1
and client2 start empty and need a one-time seed.

### Seed client1 with NEO + GAS

```bash
# 1. Open the consensus wallet on the consensus RPC node
curl -s -X POST http://localhost:40332 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"openwallet",
       "params":["/neo-cli/Wallets/wallet-consensus.privatenet3.json","neo"]}'

# 2. Send 10000 GAS from consensus → client1
curl -s -X POST http://localhost:40332 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"sendfrom",
       "params":["0xd2a4cff31913016155e38e474a2c06d08be276cf",
                 "NXXazKH39yNFWWZF5MJ8tEN98VYHwzn7g3",
                 "NdihqSLYTf1B1WYuzhM52MNqvCNPJKLZaz","10000"]}'

# 3. Optionally also send some NEO (contract 0xef4073a0f2b305a38ec4050e4d3d28bc40ea63f5)
```

### Import client1 into NeoLine

NeoLine → **Manage Wallet → Import → Private Key** → paste:

```
L3cNMQUSrvUrHx1MzacwHiUeCWzqK2MLt5fPvJj9mz6L2rzYZpok
```

## 3. Configure NeoLine for local-net

In NeoLine: **Settings → Networks → Add Custom**.

| Field | Value |
|---|---|
| Name | `localnet` |
| Type | `private` |
| Magic Number | per the AxLabs README (typically `1234567890`) |
| RPC Address | `http://localhost:10332` |

Switch the active network to `localnet`.

## 4. Compile + deploy the vault

From the **neovest** repository root:

```bash
./gradlew :contract:neow3jCompile
```

You can then deploy two ways — pick one:

### Option A: deploy from the browser (recommended)

Skip ahead to step 5, run the UI, click **Deploy** on the landing page. The
connected wallet (your imported client1) signs a `ContractManagement.deploy`
tx with the bundled NEF.

### Option B: deploy from the CLI

```bash
export NEO_RPC=http://localhost:10332
export DEPLOYER_WIF=L3cNMQUSrvUrHx1MzacwHiUeCWzqK2MLt5fPvJj9mz6L2rzYZpok
export VAULT_OWNER=NdihqSLYTf1B1WYuzhM52MNqvCNPJKLZaz   # or any other address

./gradlew :deploy:run -PmainClass=com.smartargs.vesting.deploy.Deploy
```

The script prints the resulting contract hash.

## 5. Configure + run the UI

```bash
cd ui
cp .env.local.example .env.local
```

`.env.local` should contain:

```
VITE_NETWORK=localnet
# VITE_RPC_URL is intentionally unset — see CORS note below.
VITE_WC_PROJECT_ID=         # leave empty unless you want WalletConnect too
```

Then:

```bash
npm install   # first time only
npm run dev
```

> **CORS note:** `neo-cli`'s RpcServer plugin doesn't emit CORS headers, so
> a direct browser fetch from `localhost:5173` to `localhost:10332` fails.
> The Vite dev server proxies `/__rpc` → `http://localhost:10332` for you,
> and `localnet` defaults to that proxy path — leaving `VITE_RPC_URL`
> unset is the right move. To target a different chain node, set
> `LOCAL_RPC_PROXY_TARGET=http://localhost:40332` (or 20332) in your shell
> before `npm run dev`.

> **Vite env note:** Vite reads `.env.local` only on dev-server startup. If
> you change it, restart `npm run dev`. The blue "Localnet" banner at the
> top of the page is your confirmation that `VITE_NETWORK` is taking
> effect.

Open http://localhost:5173.

## 6. Walk through the flows

### Open the deployed vault

Paste the contract hash from step 4 into the landing-page input, or
navigate directly to `http://localhost:5173/v/<contract-hash>`.

### Create a lock

`/v/<hash>/manage` → **Create lock** tab. Fields:

- **Token contract**: the NEP-17 hash you want to vest. For testing, the
  native GAS token's hash is `0xd2a4cff31913016155e38e474a2c06d08be276cf`.
- **Beneficiary**: any Neo3 address — for testing, a second wallet (client2)
  works.
- **Amount**: in whole tokens. GAS has 8 decimals; "1.5" = 1.5 GAS.
- **Schedule type**: cliff or linear.
- **Dates**: pick something in the near future for cliff; a small range for
  linear.
- **Revocable**: check if you want to test the revoke path.

Hit **Create lock**. The wallet signs a `transfer(token, vault, amount,
data)` tx that lands the funds in the vault and creates the lock atomically.

### Claim

Switch to the beneficiary wallet in NeoLine (e.g. client2). Open
`/v/<hash>/manage` → **As beneficiary** tab. Once the cliff/start has
passed, the **Claim** button is enabled.

### Revoke

Switch back to the owner wallet → **As depositor** tab. For revocable
locks, the **Revoke** button is enabled. The unvested portion returns to
the owner; the schedule freezes; the beneficiary can still claim what was
already vested.

## Troubleshooting

- **No banner at the top of the page / "mainnet" shown on the deploy page**:
  Vite hasn't picked up your `.env.local`. Make sure the file is
  `ui/.env.local` (not `.env.example`), then restart `npm run dev`.
- **Wallet says "wrong network"**: NeoLine remembers the last network. Open
  the extension, switch to your `localnet`, and reload the page.
- **`"VV: not owner"` on deposit**: the vault was deployed with a different
  owner than the wallet you're depositing from. Re-deploy with the correct
  `VAULT_OWNER`, or switch wallets.
- **Tx faults with `"VV: cliff in past"`**: clock skew between your laptop
  and the chain. Pick a start date 1–2 minutes in the future.
- **Bundle says checksum mismatch / "Bytecode mismatch" on the dashboard**:
  the deployed NEF doesn't match what the UI was built against. Re-run
  `./gradlew :contract:neow3jCompile` then `cd ui && npm run build` (the
  prebuild step auto-regenerates `EXPECTED_NEF_CHECKSUM`).
- **`getbalance` returns 0 for client1**: it wasn't seeded yet — run the
  `sendfrom` JSON-RPC commands in step 2.
