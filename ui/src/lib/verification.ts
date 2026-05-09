/**
 * Source-attested verification: compare the checksum of the deployed contract's
 * NEF bytecode against an expected value bundled with this UI build.
 *
 * If the contract source hasn't changed, every reproducible compile produces
 * an identical NEF (down to the byte), so the checksum is a deterministic
 * commitment to "this is the audited contract". Any local modification,
 * accidental or otherwise, changes the checksum.
 *
 * The expected value lives in {@link ./nef-checksum} and is auto-regenerated
 * from `contract/build/neow3j/VestingVault.nef` by `scripts/sync-checksum.mjs`,
 * which runs as `predev` and `prebuild` — no manual sync needed.
 */

import { useQuery } from '@tanstack/react-query';
import { getContractChecksum } from './contract';
import { CONTRACT as DEMO_CONTRACT } from './data';
import { EXPECTED_NEF_CHECKSUM } from './nef-checksum';

export { EXPECTED_NEF_CHECKSUM };

export type VerificationStatus =
  | 'loading'
  | 'verified'    // RPC checksum matches the expected value
  | 'unverified'  // RPC checksum differs — contract source isn't the bundled source
  | 'demo'        // canned demo contract, never deployed
  | 'unknown';    // RPC failed or contract not found

const isDemoHash = (contractHash: string) =>
  contractHash === DEMO_CONTRACT || contractHash === DEMO_CONTRACT.replace(/^0x/, '');

export function useVerification(contractHash: string) {
  return useQuery<VerificationStatus>({
    queryKey: ['verification', contractHash],
    queryFn: async () => {
      if (isDemoHash(contractHash)) return 'demo';
      const checksum = await getContractChecksum(contractHash);
      if (checksum == null) return 'unknown';
      return checksum === EXPECTED_NEF_CHECKSUM ? 'verified' : 'unverified';
    },
    enabled: !!contractHash,
    // Bytecode of an immutable contract never changes; cache aggressively.
    staleTime: 60 * 60 * 1000,
  });
}
