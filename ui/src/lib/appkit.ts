/**
 * Reown AppKit setup. Called once at app boot; wires the Neo3 adapter so the
 * connect modal shows compatible wallets (Neon, NeoLine, OneGate via
 * WalletConnect).
 *
 * Without {@code VITE_WC_PROJECT_ID} set, AppKit is a no-op and the connect
 * button is disabled — the dashboard still renders read-only.
 */

import { createAppKit } from '@reown/appkit/react';
import {
  Neo3Adapter,
  Neo3Constants,
  neo3MainnetNetwork,
  neo3TestnetNetwork,
} from '@cityofzion/appkit-neo3-adapter';

export const neo3Adapter = new Neo3Adapter();

let _initialized = false;

export function setupAppKit(): boolean {
  if (_initialized) return true;
  const projectId = import.meta.env.VITE_WC_PROJECT_ID;
  if (!projectId) return false;

  const network = import.meta.env.VITE_NETWORK ?? 'mainnet';
  const networks =
    network === 'testnet'
      ? [neo3TestnetNetwork, neo3MainnetNetwork]
      : [neo3MainnetNetwork, neo3TestnetNetwork];

  createAppKit({
    projectId,
    adapters: [neo3Adapter],
    networks: networks as never,
    universalProviderConfigOverride: Neo3Constants.OVERRIDES,
    metadata: {
      name: 'NeoVest',
      description: 'Trustless Neo N3 token vesting',
      url: typeof window !== 'undefined' ? window.location.origin : 'https://neovest.example',
      icons: [],
    },
    features: {
      analytics: false,
      email: false,
      socials: false,
      swaps: false,
      send: false,
      receive: false,
      onramp: false,
    },
  });
  _initialized = true;
  return true;
}

export function isWalletAvailable(): boolean {
  return !!import.meta.env.VITE_WC_PROJECT_ID;
}
