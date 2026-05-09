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
│   ├── data.ts             # mock data (replace with on-chain hooks)
│   ├── format.ts           # number/date formatting helpers
│   ├── vesting-math.ts     # client-side mirror of contract schedule math
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

- Charts are **custom SVG** rather than Recharts (the project plan suggests
  Recharts). The custom SVG matches the design pixel-for-pixel; swapping in
  Recharts later is straightforward and isolated to `components/charts/`.
- Wallet integration is stubbed. Wire up `@cityofzion/neon-dappkit` and
  `@cityofzion/neon-js` in `lib/wallet.ts` (TODO) and the create-lock form
  in `pages/Manage.tsx`.
- Data is currently mocked in `lib/data.ts`. Replace with TanStack Query
  hooks that read from Neo RPC via the contract manifest.
