/**
 * TanStack Query hooks. Each hook accepts a `contractHash` and reads from
 * the deployed contract via RPC.
 *
 * The literal hash `demo` short-circuits to the canned dataset in
 * `lib/demo-data.ts` for screenshot purposes — see {@link isDemoVault}.
 */

import { useQuery } from '@tanstack/react-query';
import * as contract from './contract';
import { vestedAt } from './vesting-math';
import {
  DEMO_LOCKS,
  DEMO_OWNER,
  DEMO_TODAY,
  DEMO_TOKEN,
  isDemoVault,
} from './demo-data';

// ---------- Read hooks ----------

export function useLockCount(contractHash: string) {
  return useQuery({
    queryKey: ['lockCount', contractHash],
    queryFn: () => (isDemoVault(contractHash) ? DEMO_LOCKS.length : contract.getLockCount(contractHash)),
    enabled: !!contractHash,
  });
}

export function useLock(contractHash: string, lockId: number | undefined) {
  return useQuery({
    queryKey: ['lock', contractHash, lockId],
    queryFn: () => {
      if (lockId == null) return null;
      if (isDemoVault(contractHash)) return DEMO_LOCKS.find((l) => l.id === lockId) ?? null;
      return contract.getLock(contractHash, lockId);
    },
    enabled: !!contractHash && lockId != null,
  });
}

/** All locks in the vault — used by the dashboard table + timeline. */
export function useAllLocks(contractHash: string) {
  return useQuery({
    queryKey: ['allLocks', contractHash],
    queryFn: () => (isDemoVault(contractHash) ? DEMO_LOCKS : contract.getAllLocks(contractHash)),
    enabled: !!contractHash,
  });
}

export function useVested(contractHash: string, lockId: number | undefined) {
  return useQuery({
    queryKey: ['vested', contractHash, lockId],
    queryFn: () => {
      if (lockId == null) return 0;
      if (isDemoVault(contractHash)) {
        const l = DEMO_LOCKS.find((x) => x.id === lockId);
        return l ? vestedAt(l, DEMO_TODAY) : 0;
      }
      return contract.vestedAmount(contractHash, lockId);
    },
    enabled: !!contractHash && lockId != null,
  });
}

export function useClaimable(contractHash: string, lockId: number | undefined) {
  return useQuery({
    queryKey: ['claimable', contractHash, lockId],
    queryFn: () => {
      if (lockId == null) return 0;
      if (isDemoVault(contractHash)) {
        const l = DEMO_LOCKS.find((x) => x.id === lockId);
        if (!l) return 0;
        return Math.max(0, vestedAt(l, DEMO_TODAY) - (l.claimed ?? 0));
      }
      return contract.claimableAmount(contractHash, lockId);
    },
    enabled: !!contractHash && lockId != null,
  });
}

/** The vault owner — the address authorized to deposit / create new locks. */
export function useOwner(contractHash: string) {
  return useQuery({
    queryKey: ['owner', contractHash],
    queryFn: () => (isDemoVault(contractHash) ? DEMO_OWNER : contract.getOwner(contractHash)),
    enabled: !!contractHash,
    staleTime: 60 * 60 * 1000, // owner is immutable
  });
}

export function useTotalLocked(contractHash: string, tokenHash: string | undefined) {
  return useQuery({
    queryKey: ['totalLocked', contractHash, tokenHash],
    queryFn: () => {
      if (!tokenHash) return 0;
      if (isDemoVault(contractHash)) return DEMO_LOCKS.reduce((s, l) => s + l.amount, 0);
      return contract.totalLocked(contractHash, tokenHash);
    },
    enabled: !!contractHash && !!tokenHash,
  });
}

export function useLocksByBeneficiary(contractHash: string, beneficiary: string | undefined) {
  return useQuery({
    queryKey: ['locksByBeneficiary', contractHash, beneficiary],
    queryFn: () => {
      if (!beneficiary) return [] as number[];
      if (isDemoVault(contractHash)) {
        return DEMO_LOCKS.filter((l) => l.ben === beneficiary).map((l) => l.id);
      }
      return contract.getLocksByBeneficiary(contractHash, beneficiary);
    },
    enabled: !!contractHash && !!beneficiary,
  });
}

/** NEP-17 symbol + decimals + totalSupply for a token contract. */
export function useTokenInfo(tokenHash: string | undefined) {
  return useQuery({
    queryKey: ['tokenInfo', tokenHash],
    queryFn: () => {
      if (!tokenHash) return null;
      // The demo token's hash is invented — short-circuit to its canned info.
      if (tokenHash.toLowerCase().endsWith('a6b7c812')) return DEMO_TOKEN;
      return contract.getTokenInfo(tokenHash);
    },
    enabled: !!tokenHash,
    // Symbol/decimals are immutable; totalSupply changes rarely. Cache for 1h.
    staleTime: 60 * 60 * 1000,
  });
}

export function useLocksByDepositor(contractHash: string, depositor: string | undefined) {
  return useQuery({
    queryKey: ['locksByDepositor', contractHash, depositor],
    queryFn: () => {
      if (!depositor) return [] as number[];
      if (isDemoVault(contractHash)) {
        return DEMO_LOCKS.filter((l) => l.dep === depositor).map((l) => l.id);
      }
      return contract.getLocksByDepositor(contractHash, depositor);
    },
    enabled: !!contractHash && !!depositor,
  });
}

/**
 * Roles the connected wallet has at a given vault: owner, depositor of any
 * lock, beneficiary of any lock, or none. Three RPC calls per vault — keep
 * the caller list short.
 */
export interface VaultRoles {
  isOwner: boolean;
  isDepositor: boolean;
  isBeneficiary: boolean;
}
export function useVaultRoles(contractHash: string, meHash: string | undefined) {
  return useQuery<VaultRoles>({
    queryKey: ['vaultRoles', contractHash, meHash],
    queryFn: async () => {
      if (!meHash) return { isOwner: false, isDepositor: false, isBeneficiary: false };
      if (isDemoVault(contractHash)) {
        return {
          isOwner: meHash.toLowerCase() === DEMO_OWNER.toLowerCase(),
          isDepositor: DEMO_LOCKS.some((l) => l.dep.toLowerCase() === meHash.toLowerCase()),
          isBeneficiary: DEMO_LOCKS.some((l) => l.ben.toLowerCase() === meHash.toLowerCase()),
        };
      }
      const [owner, asDep, asBen] = await Promise.all([
        contract.getOwner(contractHash),
        contract.getLocksByDepositor(contractHash, meHash),
        contract.getLocksByBeneficiary(contractHash, meHash),
      ]);
      return {
        isOwner: !!owner && owner.toLowerCase() === meHash.toLowerCase(),
        isDepositor: asDep.length > 0,
        isBeneficiary: asBen.length > 0,
      };
    },
    enabled: !!contractHash && !!meHash,
    staleTime: 5 * 60 * 1000,
  });
}
