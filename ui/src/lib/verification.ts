/**
 * Source-attested verification: prove the deployed contract IS the audited,
 * bundled source by comparing a cryptographically strong digest of its
 * on-chain bytecode against a value baked into this UI build.
 *
 * The authoritative check is the SHA-256 of the deployed NEF *script* (the
 * actual executable). A reproducible compile of the unchanged source produces
 * an identical script, so a matching SHA-256 is a collision-resistant
 * commitment to "this is the audited contract"; any modification changes it.
 *
 * The NEF's built-in 4-byte checksum is only 32 bits and therefore NOT
 * collision-resistant — an attacker could craft different bytecode with the
 * same checksum. So it is used only as a fast pre-filter, and as a fallback
 * for the rare RPC node that doesn't surface the script. It is never the sole
 * basis for a "verified" verdict.
 *
 * The expected values live in {@link ./nef-checksum} and are auto-regenerated
 * from `contract/build/neow3j/VestingVault.nef` by `scripts/sync-checksum.mjs`,
 * which runs as `predev` and `prebuild` — no manual sync needed.
 */

import { useQuery } from '@tanstack/react-query';
import { getDeployedNefInfo, type DeployedNefInfo } from './contract';
import { isDemoVault } from './demo-data';
import { EXPECTED_NEF_CHECKSUM, EXPECTED_NEF_SCRIPT_SHA256 } from './nef-checksum';

export { EXPECTED_NEF_CHECKSUM, EXPECTED_NEF_SCRIPT_SHA256 };

export type VerificationStatus =
  | 'loading'
  | 'verified'    // deployed bytecode matches the bundled audited source
  | 'unverified'  // bytecode differs — not the bundled source
  | 'demo'        // canned demo dataset, not a deployed contract
  | 'unknown';    // RPC failed or contract not found

/**
 * Decide a verification verdict from the deployed NEF facts. Pure function,
 * separated from the React hook so it can be unit-tested exhaustively.
 *
 * Precedence:
 *   1. If both the deployed script hash and the bundled expected hash are
 *      available, that comparison is authoritative (collision-resistant).
 *   2. Otherwise fall back to the 32-bit checksum (weak; only when the script
 *      is unavailable from either side).
 *   3. If neither axis can be evaluated, the status is 'unknown'.
 */
export function classifyDeployedNef(info: DeployedNefInfo | null): VerificationStatus {
  if (info == null) return 'unknown';

  // Authoritative: full-script SHA-256 comparison.
  if (info.scriptSha256 != null && EXPECTED_NEF_SCRIPT_SHA256 !== '') {
    return info.scriptSha256 === EXPECTED_NEF_SCRIPT_SHA256 ? 'verified' : 'unverified';
  }

  // Fallback: the script wasn't available (old RPC, or NEF not compiled at
  // build time). Use the weak checksum rather than failing closed — but this
  // path can only ever confirm the cheap pre-filter, not the strong proof.
  if (info.checksum == null) return 'unknown';
  return info.checksum === EXPECTED_NEF_CHECKSUM ? 'verified' : 'unverified';
}

export function useVerification(contractHash: string) {
  return useQuery<VerificationStatus>({
    queryKey: ['verification', contractHash],
    queryFn: async () => {
      if (isDemoVault(contractHash)) return 'demo';
      const info = await getDeployedNefInfo(contractHash);
      return classifyDeployedNef(info);
    },
    enabled: !!contractHash,
    // Bytecode of an immutable contract never changes; cache aggressively.
    staleTime: 60 * 60 * 1000,
  });
}
