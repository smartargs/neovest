# UI Hosting & Customization

The dashboard is a Vite + React + TypeScript SPA in `ui/`. It calls the Neo
RPC directly from the browser — there is no backend.

## Run locally

```bash
cd ui
npm install
npm run dev
```

Open http://localhost:5173. Routes:

- `/` — landing page with a contract-hash input
- `/v/:contractHash` — read-only vault dashboard
- `/v/:contractHash/manage` — wallet-gated manage page
- `/v/:contractHash/lock/:lockId` — single-lock detail view

## Build a static bundle

```bash
cd ui
npm run build
```

Outputs to `ui/dist/`. Host it anywhere that serves static files — GitHub
Pages, Cloudflare Pages, IPFS, Netlify, S3, your own nginx.

The bundle target is ~300 KB gzipped.

## Hosting recipes

### GitHub Pages

```bash
npm run build
# Push ui/dist/ to a gh-pages branch
```

Configure GitHub Pages to serve from `gh-pages` and enable a custom 404
fallback to `index.html` so client-side routes resolve.

### Cloudflare Pages / Netlify / Vercel

Connect the repo. Build command: `cd ui && npm run build`. Output dir:
`ui/dist`. Add a SPA redirect rule: every path → `/index.html` with status
200, except for `/assets/*`.

### IPFS

```bash
npm run build
ipfs add -r ui/dist
```

Pin the resulting CID. Note that IPFS gateways may not support client-side
routing — use HashRouter (already configured optionally in `App.tsx`) for
gateway compatibility.

## Customization

- **Branding.** Edit `ui/src/components/BrandMark.tsx` and the page title in
  `ui/index.html`.
- **Theme.** All color tokens live in `ui/src/styles.css` under `:root` and
  `[data-theme="light"]`. Tweak there; everything else uses the variables.
- **Known deployments.** Add your contract hash to
  `ui/src/lib/known-deployments.ts` and submit a PR; the landing page
  surfaces these.
- **Network.** The default RPC URL is configured per network in
  `ui/src/lib/rpc.ts`. Override at runtime via the `?rpc=` query parameter.

## Submitting a deployment

To list a deployment in the shared known-deployments list:

1. Verify the deployed contract matches a tagged release (see `VERIFY.md`).
2. Add an entry to `ui/src/lib/known-deployments.ts` with: contract hash,
   network, project name, optional logo URL, and a brief description.
3. Submit a pull request. Maintainers will spot-check the verification.
