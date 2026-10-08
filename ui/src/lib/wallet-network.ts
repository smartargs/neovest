import type { Network } from './rpc';

export type WalletNetwork = 'mainnet' | 'testnet' | 'private' | 'unknown';

const NEO3_MAINNET_CHAIN_ID = 3;
const NEO3_TESTNET_CHAIN_ID = 6;

export function walletNetworkFromNeoLine(chainId: number | undefined, label: string | undefined): WalletNetwork {
  if (chainId === NEO3_MAINNET_CHAIN_ID) return 'mainnet';
  if (chainId === NEO3_TESTNET_CHAIN_ID) return 'testnet';
  if (typeof chainId === 'number') return 'private';
  const l = (label ?? '').trim().toLowerCase();
  if (l === 'mainnet') return 'mainnet';
  if (l.includes('testnet') || l.startsWith('n3t')) return 'testnet';
  return l ? 'private' : 'unknown';
}

export function walletNetworkFromCaip(caipAddress: string | undefined): WalletNetwork {
  const ref = (caipAddress ?? '').split(':')[1]?.trim().toLowerCase();
  if (ref === 'mainnet') return 'mainnet';
  if (ref === 'testnet') return 'testnet';
  return ref ? 'private' : 'unknown';
}

export function walletMatchesApp(wallet: WalletNetwork, app: Network): boolean {
  if (app === 'localnet') return wallet === 'private';
  return wallet === app;
}

export function networkLabel(n: WalletNetwork | Network): string {
  switch (n) {
    case 'mainnet': return 'Neo N3 Mainnet';
    case 'testnet': return 'Neo N3 Testnet';
    case 'localnet': return 'a local private net';
    case 'private': return 'a private network';
    default: return 'an unknown network';
  }
}
