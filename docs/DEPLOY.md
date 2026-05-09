# Deploying NeoVest

There are two supported paths to deploy a vault: from the browser via the
dashboard, or from the command line via Gradle. The browser path is the
default for end users; the CLI path is intended for scripted or CI
deployments.

## Path A — from the browser (recommended)

1. Open the dashboard at the URL where it is hosted (or run `npm run dev`
   under `ui/` for a local development build).
2. Click **Deploy a vault**.
3. Connect a wallet (NeoLine extension or any WalletConnect-compatible
   wallet such as Neon, OneGate, or NeoLine Mobile).
4. Enter the **owner address**: the address that will be authorized to
   create new locks against this vault. Defaults to the connected wallet.
5. Review the cost estimate, predicted contract hash, and bundled NEF
   checksum. Sign the transaction.
6. After confirmation the dashboard reads the actual contract hash from
   the transaction's application log and routes you to the new vault.

The browser path bundles the audited NEF + manifest into the build, so
the contract you deploy is byte-identical to the source committed in the
repository at the time the UI was built. The bytecode checksum is
verifiable via the `VERIFY.md` procedure.

## Path B — from the command line

### Prerequisites

- **Java 17+** (`java --version`)
- **Gradle** — the bundled `./gradlew` wrapper is sufficient.
- **A funded Neo N3 account** on the target network.

### 1. Compile

```bash
./gradlew :contract:neow3jCompile
```

This produces:

- `contract/build/neow3j/VestingVault.nef`
- `contract/build/neow3j/VestingVault.manifest.json`

Pin the neow3j version in `gradle.properties` so any third party can
reproduce identical bytecode.

### 2. Local testing

The repository ships a helper for the AxLabs Neo3 private-net Docker
setup. See `docs/LOCAL.md` for the full walkthrough; the short version:

```bash
./localnet/start.sh
export NEO_RPC=http://localhost:10332
export DEPLOYER_WIF=L3cNMQUSrvUrHx1MzacwHiUeCWzqK2MLt5fPvJj9mz6L2rzYZpok  # client1
./gradlew :deploy:run -PmainClass=com.smartargs.vesting.deploy.Deploy
```

Record the contract hash that the deploy script prints; the dashboard
needs it to open the vault.

### 3. Mainnet or testnet

```bash
export NEO_RPC=https://mainnet1.neo.coz.io:443      # or your testnet RPC
export DEPLOYER_WIF=<wif-of-funded-account>
export VAULT_OWNER=<N-prefixed-address-or-0x-scripthash>   # optional; defaults to deployer
./gradlew :deploy:run -PmainClass=com.smartargs.vesting.deploy.Deploy
```

Record the deployed contract hash. To list it as a known deployment in
the dashboard, add an entry to `ui/src/lib/known-deployments.ts` and open
a pull request.

## Pointing the dashboard at a deployed vault

```
https://<your-host>/v/<contract-hash>
```

Or, locally:

```bash
cd ui
npm install
npm run dev
```

The dashboard will fetch every lock, schedule, and event from the chain
directly. There is no backend.

## Disclaimer

Deploying this contract incorrectly may lock tokens irrecoverably. Test
on a local private-net and on testnet before mainnet. There is no admin
recovery path; this is intentional.
