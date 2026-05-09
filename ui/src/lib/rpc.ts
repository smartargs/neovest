/**
 * RPC config. Resolution order, highest priority first:
 *
 *   1. `?rpc=...` URL query parameter (one-off overrides for shareable links)
 *   2. `localStorage["neovest.rpc"]` (sticky preference)
 *   3. `VITE_RPC_URL` build-time env (set in `.env.local`)
 *   4. Default per network
 *
 * The default network can also be overridden at build time via `VITE_NETWORK`
 * (`mainnet` / `testnet` / `localnet`); falls back to mainnet if unset.
 */

import { rpc } from '@cityofzion/neon-js';

type RPCClient = InstanceType<typeof rpc.RPCClient>;

export type Network = 'mainnet' | 'testnet' | 'localnet';

const DEFAULTS: Record<Network, string> = {
  mainnet: 'https://mainnet1.neo.coz.io:443',
  testnet: 'https://testnet1.neo.coz.io:443',
  // Sentinel — replaced at resolve time with `${origin}/__rpc` so it stays
  // same-origin (Vite dev proxy → localhost:10332) while still being an
  // absolute URL, which neon-dappkit's NeonInvoker requires.
  localnet: '__PROXY__',
};

/** Build-time default network — set via `VITE_NETWORK` in `.env.local`. */
export function defaultNetwork(): Network {
  const v = import.meta.env.VITE_NETWORK;
  if (v === 'testnet' || v === 'localnet' || v === 'mainnet') return v;
  return 'mainnet';
}

export function resolveRpcUrl(network: Network = defaultNetwork()): string {
  const fromQuery = new URLSearchParams(window.location.search).get('rpc');
  if (fromQuery) return fromQuery;
  const fromStorage = window.localStorage.getItem('neovest.rpc');
  if (fromStorage) return fromStorage;
  const fromEnv = import.meta.env.VITE_RPC_URL;
  if (fromEnv) return fromEnv;
  const def = DEFAULTS[network];
  if (def === '__PROXY__') return `${window.location.origin}/__rpc`;
  return def;
}

let _client: RPCClient | null = null;
let _clientUrl: string | null = null;

/** Lazy singleton — neon-js RPCClient is cheap, but reusing keeps connection state warm. */
export function getRpcClient(network: Network = defaultNetwork()): RPCClient {
  const url = resolveRpcUrl(network);
  if (_client && _clientUrl === url) return _client;
  _client = new rpc.RPCClient(url);
  _clientUrl = url;
  return _client;
}
