import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    // neon-js → ripemd160 → readable-stream needs the full Node stream/buffer
    // polyfill stack at runtime, not just the globals. Without `protocolImports`
    // and the explicit module list, readable-stream's `_stream_writable.js`
    // dies on a missing process internal at module-init time.
    nodePolyfills({
      protocolImports: true,
      globals: { Buffer: true, global: true, process: true },
      include: [
        'buffer',
        'process',
        'stream',
        'util',
        'crypto',
        'events',
        'string_decoder',
      ],
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    'process.env': {},
    // readable-stream@2.x checks `process.version.slice(0,5)` at module-init.
    // The bundled `process` polyfill leaves `version` undefined, which crashes.
    // We substitute string values so the slice is harmless and the
    // `!process.browser` short-circuits true.
    'process.browser': 'true',
    'process.version': JSON.stringify('v22.0.0'),
    global: 'globalThis',
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
      // Same substitutions as the top-level `define`. Vite's top-level define
      // only touches user source — pre-bundled deps go through esbuild
      // separately, and that's where readable-stream lives.
      define: {
        global: 'globalThis',
        'process.browser': 'true',
        'process.version': JSON.stringify('v22.0.0'),
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // The wallet stack (@reown/appkit + @walletconnect/* + wagmi/viem)
        // and the Neo crypto stack (@cityofzion/*) each weigh more than a
        // megabyte on their own. Without splitting them out, Vite drops
        // everything into one >1.5 MB chunk that trips the CI bundle-size
        // budget. Keep the React runtime in its own chunk so it can cache
        // independently of app code.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@reown') || id.includes('@walletconnect')) {
            return 'wallet-connect';
          }
          if (id.includes('wagmi') || id.includes('viem')) {
            return 'wallet-evm';
          }
          if (id.includes('@cityofzion/neon-core')) {
            return 'neon-core';
          }
          if (id.includes('@cityofzion')) {
            return 'neon';
          }
          // The crypto polyfills pulled in by neon-core (elliptic, bn.js,
          // ripemd160, scrypt, sha.js, hash-base, …) add up to several
          // hundred KB. Split them out so neon-core itself stays small.
          if (
            id.includes('/elliptic/') ||
            id.includes('/bn.js/') ||
            id.includes('/ripemd160/') ||
            id.includes('/scrypt') ||
            id.includes('/sha.js/') ||
            id.includes('/hash-base/') ||
            id.includes('/create-hash/') ||
            id.includes('/create-hmac/') ||
            id.includes('/asn1.js/') ||
            id.includes('/readable-stream/')
          ) {
            return 'crypto-vendor';
          }
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/react-router') ||
            id.includes('/scheduler/')
          ) {
            return 'react-vendor';
          }
          return undefined;
        },
      },
    },
  },
  // Dev-only same-origin proxy for the local Neo N3 chain. neo-cli's RpcServer
  // doesn't emit CORS headers, so browsers reject direct fetches from a Vite
  // dev origin (5173/5175) to localhost:10332. Routing through `/__rpc` keeps
  // the request same-origin and Vite forwards to the chain.
  // Override LOCAL_RPC_PROXY_TARGET to point at client2/consensus instead.
  server: {
    proxy: {
      '/__rpc': {
        target: process.env.LOCAL_RPC_PROXY_TARGET ?? 'http://localhost:10332',
        changeOrigin: true,
        ws: true,
        rewrite: (p) => p.replace(/^\/__rpc/, ''),
      },
    },
  },
});
