/**
 * Community-vetted VestingVault deployments. PR additions welcome — see
 * docs/UI.md for verification expectations.
 */

export interface KnownDeployment {
  hash: string;
  network: 'mainnet' | 'testnet';
  name: string;
  description: string;
  logoUrl?: string;
}

export const KNOWN_DEPLOYMENTS: KnownDeployment[] = [
  {
    hash: '0x7f3a4e8b9d2f1c5a6b8e9d3f2a1c4b7e2c1',
    network: 'mainnet',
    name: 'Lattice (LTC)',
    description: 'Demo: Lattice token vesting (mock data)',
  },
];
