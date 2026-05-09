/**
 * RPC config. Network and endpoint are resolved from (in priority order):
 *
 *   1. `?rpc=...` URL query parameter (one-off overrides for shareable links)
 *   2. localStorage `neovest.rpc` (sticky preference)
 *   3. Default per network
 *
 * Networks are inferred from the contract hash by checking known deployments;
 * unknown contracts default to mainnet.
 */

import { rpc } from '@cityofzion/neon-js';

type RPCClient = InstanceType<typeof rpc.RPCClient>;

export type Network = 'mainnet' | 'testnet' | 'localnet';

const DEFAULTS: Record<Network, string> = {
  mainnet: 'https://mainnet1.neo.coz.io:443',
  testnet: 'https://testnet1.neo.coz.io:443',
  localnet: 'http://localhost:50012',
};

export function resolveRpcUrl(network: Network = 'mainnet'): string {
  const fromQuery = new URLSearchParams(window.location.search).get('rpc');
  if (fromQuery) return fromQuery;
  const fromStorage = window.localStorage.getItem('neovest.rpc');
  if (fromStorage) return fromStorage;
  return DEFAULTS[network];
}

let _client: RPCClient | null = null;
let _clientUrl: string | null = null;

/** Lazy singleton — neon-js RPCClient is cheap, but reusing keeps connection state warm. */
export function getRpcClient(network: Network = 'mainnet'): RPCClient {
  const url = resolveRpcUrl(network);
  if (_client && _clientUrl === url) return _client;
  _client = new rpc.RPCClient(url);
  _clientUrl = url;
  return _client;
}
