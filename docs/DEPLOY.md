# Deploying NeoVest

This guide walks through deploying your own immutable VestingVault on Neo N3.

## Prerequisites

- **Java 17+** (`java --version`)
- **Gradle** — bundled `./gradlew` works, no separate install needed
- **A funded Neo N3 account** for the network you're deploying to
- For local testing: **[neo-express](https://github.com/neo-project/neo-express)**

## 1. Compile the contract

```bash
./gradlew :contract:neow3jCompile
```

This produces:

- `contract/build/neow3j/VestingVault.nef`
- `contract/build/neow3j/VestingVault.manifest.json`

Both files are inputs to deployment. **Pin the neow3j version**
(`gradle.properties`) so any third party can reproduce identical bytecode.

## 2. Test locally with neo-express

Start neo-express in a separate terminal:

```bash
neoxp create
neoxp run
```

Then deploy:

```bash
./gradlew :deploy:run -PmainClass=com.smartargs.vesting.deploy.DeployLocal
```

You should see a transaction hash and, after a block, the resulting contract
hash. Note it down — the UI will need it.

Smoke-test the contract by creating a lock, advancing chain time, and
calling `claim`. See `contract/README.md` for the test suite which already
covers these flows.

## 3. Deploy to mainnet (or testnet)

Set the network and a funded deployer WIF:

```bash
export NEO_RPC=https://mainnet1.neo.coz.io:443      # or your testnet RPC
export DEPLOYER_WIF=<wif-of-funded-account>
```

Then:

```bash
./gradlew :deploy:run
```

Record the deployed contract hash. To list it as a known deployment in the
UI, edit `ui/src/lib/known-deployments.ts` and submit a PR.

## 4. Point the UI at your contract

Open the UI at:

```
https://your-host/v/<contract-hash>
```

Or run the UI locally:

```bash
cd ui
npm install
npm run dev
```

## Disclaimer

Deploying this contract incorrectly may lock tokens irrecoverably. Test on a
local neo-express and on testnet before mainnet. There is no admin recovery
path — that's by design.
