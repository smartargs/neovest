# `ui/` — NeoVest Dashboard

Vite + React + TypeScript + Tailwind. Static SPA, no backend.

## Develop

```bash
npm install
npm run dev
```

Opens http://localhost:5173.

## Build

```bash
npm run build
```

Outputs `dist/`.

## Test

```bash
npm run test          # vitest — unit tests of src/lib (RPC mocked); fast, no chain
npm run e2e:install   # one-time: download the chromium binary
npm run e2e           # playwright — builds, serves dist/, drives a real browser
npm run typecheck     # tsc -b + the test/e2e tsconfig
```

`vitest` (`src/lib/*.test.ts`) covers the chain glue in `lib/contract.ts`
— stack-item / `Lock` decoding, `contractExists`, `getContractChecksum`,
`getTokenInfo` — with the RPC layer mocked.

`playwright` (`e2e/`) drives the **built** bundle in a headless browser:
the landing page boots, the vault-lookup form behaves (it verifies a hash
is a deployed contract before navigating), and the demo vault (`/v/demo`,
a canned dataset, zero RPC) renders the dashboard. Its real job is catching
runtime-only regressions in the polyfill / `manualChunks` config in
`vite.config.ts` — that config passes `vite build` even when the result is
a blank page (see the `output.intro` note there for one such trap).

Wallet-gated flows (create lock, claim, revoke, deploy) have no e2e —
driving a NeoLine / WalletConnect popup is brittle and buys little. The
contract logic itself is covered by the JUnit suite under `../contract/`.

## Routes

- `/` — landing page; paste a contract hash
- `/v/:contractHash` — Dashboard (read-only)
- `/v/:contractHash/manage` — Manage (wallet-gated tabs)
- `/v/:contractHash/lock/:lockId` — single-lock detail

## Layout

```
src/
├── main.tsx                # entrypoint
├── App.tsx                 # router + theme/shell
├── styles.css              # design tokens + base styles (port of design's CSS)
├── lib/
│   ├── contract.ts         # RPC reads: lock decoding, token info, bytecode facts
│   ├── hooks.ts            # TanStack Query hooks over contract.ts (+ demo short-circuit)
│   ├── transactions.ts     # wallet-signed createLock / claim / revoke
│   ├── deploy.ts           # in-browser ContractManagement.deploy
│   ├── connection.tsx      # NeoLine + WalletConnect behind one hook
│   ├── rpc.ts              # network defaults and the localStorage RPC override
│   ├── verification.ts     # "Verified" badge: SHA-256 of deployed script vs bundled NEF
│   ├── tranche-codec.ts    # Neo stack-item (de)serializer for stepped tranches
│   ├── vesting-math.ts     # client-side mirror of contract schedule math
│   ├── lock-form.ts        # create-lock form parsing and validation
│   ├── data.ts             # display types, categories, schedule summaries
│   ├── demo-data.ts        # canned dataset for /v/demo
│   ├── format.ts           # number/date formatting helpers
│   ├── utils.ts            # shadcn-style cn() helper
│   └── known-deployments.ts
├── components/
│   ├── BrandMark.tsx
│   ├── Header.tsx
│   ├── Footer.tsx
│   ├── StatCard.tsx
│   ├── CategoryPill.tsx
│   ├── ProgressSeg.tsx
│   └── icons.tsx
├── components/charts/
│   ├── VestingTimelineChart.tsx
│   ├── DonutChart.tsx
│   ├── UpcomingBar.tsx
│   └── MiniCurve.tsx
└── pages/
    ├── Landing.tsx
    ├── Dashboard.tsx
    ├── Manage.tsx
    └── LockDetail.tsx
```

## Notes

- Charts are **custom SVG** rather than Recharts. Swapping in Recharts
  later is straightforward and isolated to `components/charts/`.
- Amounts come off the chain as exact `bigint` values (`amountRaw`,
  `claimedRaw`, the `useVested` / `useClaimable` hooks). Use those for
  anything displayed; the `number` twins exist for chart math only.
- `npm run build` injects a Content-Security-Policy and emits `_headers`;
  see `../docs/UI.md` before changing either.
