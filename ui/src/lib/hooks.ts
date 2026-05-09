/**
 * TanStack Query hooks. Each hook accepts a `contractHash` and reads from
 * the deployed contract via RPC.
 */

import { useQuery } from '@tanstack/react-query';
import * as contract from './contract';

// ---------- Read hooks ----------

export function useLockCount(contractHash: string) {
  return useQuery({
    queryKey: ['lockCount', contractHash],
    queryFn: () => contract.getLockCount(contractHash),
    enabled: !!contractHash,
  });
}

export function useLock(contractHash: string, lockId: number | undefined) {
  return useQuery({
    queryKey: ['lock', contractHash, lockId],
    queryFn: () => {
      if (lockId == null) return null;
      return contract.getLock(contractHash, lockId);
    },
    enabled: !!contractHash && lockId != null,
  });
}

/** All locks in the vault — used by the dashboard table + timeline. */
export function useAllLocks(contractHash: string) {
  return useQuery({
    queryKey: ['allLocks', contractHash],
    queryFn: () => contract.getAllLocks(contractHash),
    enabled: !!contractHash,
  });
}

export function useVested(contractHash: string, lockId: number | undefined) {
  return useQuery({
    queryKey: ['vested', contractHash, lockId],
    queryFn: () => {
      if (lockId == null) return 0;
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
      return contract.claimableAmount(contractHash, lockId);
    },
    enabled: !!contractHash && lockId != null,
  });
}

/** The vault owner — the address authorized to deposit / create new locks. */
export function useOwner(contractHash: string) {
  return useQuery({
    queryKey: ['owner', contractHash],
    queryFn: () => contract.getOwner(contractHash),
    enabled: !!contractHash,
    staleTime: 60 * 60 * 1000, // owner is immutable
  });
}

export function useTotalLocked(contractHash: string, tokenHash: string | undefined) {
  return useQuery({
    queryKey: ['totalLocked', contractHash, tokenHash],
    queryFn: () => {
      if (!tokenHash) return 0;
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
      return contract.getLocksByBeneficiary(contractHash, beneficiary);
    },
    enabled: !!contractHash && !!beneficiary,
  });
}

/** NEP-17 symbol + decimals + totalSupply for a token contract. */
export function useTokenInfo(tokenHash: string | undefined) {
  return useQuery({
    queryKey: ['tokenInfo', tokenHash],
    queryFn: () => (tokenHash ? contract.getTokenInfo(tokenHash) : null),
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
      return contract.getLocksByDepositor(contractHash, depositor);
    },
    enabled: !!contractHash && !!depositor,
  });
}
