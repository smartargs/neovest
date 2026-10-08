/**
 * RPC config. Resolution order, highest priority first:
 *
 *   1. `localStorage["neovest.rpc"]` — explicit per-browser override. The
 *      app never sets this itself; when it is present a warning banner is
 *      shown on every page because all displayed data, including the
 *      bytecode verification, comes from that endpoint.
 *   2. `VITE_RPC_URL` build-time env (set in `.env.local`)
 *   3. Default per network
 *
 * The default network can also be overridden at build time via `VITE_NETWORK`
 * (`mainnet` / `testnet` / `localnet`); falls back to mainnet if unset.
 */

import { rpc } from '@cityofzion/neon-js';

type RPCClient = InstanceType<typeof rpc.RPCClient>;

export type Network = 'mainnet' | 'testnet' | 'localnet';

export const RPC_OVERRIDE_KEY = 'neovest.rpc';

const DEFAULTS: Record<Network, string> = {
  mainnet: 'https://mainnet1.neo.coz.io:443',
  testnet: 'https://testnet1.neo.coz.io:443',
  localnet: '__PROXY__',
};

export function defaultNetwork(): Network {
  const v = import.meta.env.VITE_NETWORK;
  if (v === 'testnet' || v === 'localnet' || v === 'mainnet') return v;
  return 'mainnet';
}

export function defaultRpcUrl(network: Network = defaultNetwork()): string {
  const fromEnv = import.meta.env.VITE_RPC_URL;
  if (fromEnv) return fromEnv;
  const def = DEFAULTS[network];
  if (def === '__PROXY__') return `${window.location.origin}/__rpc`;
  return def;
}

export function getRpcOverride(): string | null {
  try {
    const v = window.localStorage.getItem(RPC_OVERRIDE_KEY);
    const trimmed = v?.trim();
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

export function clearRpcOverride(): void {
  try {
    window.localStorage.removeItem(RPC_OVERRIDE_KEY);
  } catch {
    /* ignore */
  }
}

export function resolveRpcUrl(network: Network = defaultNetwork()): string {
  return getRpcOverride() ?? defaultRpcUrl(network);
}

let _client: RPCClient | null = null;
let _clientUrl: string | null = null;

export function getRpcClient(network: Network = defaultNetwork()): RPCClient {
  const url = resolveRpcUrl(network);
  if (_client && _clientUrl === url) return _client;
  _client = new rpc.RPCClient(url);
  _clientUrl = url;
  return _client;
}
