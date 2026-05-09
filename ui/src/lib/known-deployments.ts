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

export const KNOWN_DEPLOYMENTS: KnownDeployment[] = [];
