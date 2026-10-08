/**
 * TanStack Query hooks. Each hook accepts a `contractHash` and reads from
 * the deployed contract via RPC.
 *
 * The literal hash `demo` short-circuits to the canned dataset in
 * `lib/demo-data.ts` for screenshot purposes — see {@link isDemoVault}.
 */

import { useEffect, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import * as contract from './contract';
import type { TokenInfo } from './contract';
import { vestedAt } from './vesting-math';
import {
  DEMO_LOCKS,
  DEMO_OWNER,
  DEMO_TODAY,
  DEMO_TOKEN,
  isDemoVault,
} from './demo-data';

function demoVested(lockId: number): bigint {
  const l = DEMO_LOCKS.find((x) => x.id === lockId);
  return l ? BigInt(vestedAt(l, DEMO_TODAY)) : 0n;
}

function demoClaimable(lockId: number): bigint {
  const l = DEMO_LOCKS.find((x) => x.id === lockId);
  if (!l) return 0n;
  const claimable = demoVested(lockId) - l.claimedRaw;
  return claimable > 0n ? claimable : 0n;
}

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
  return useQuery<bigint>({
    queryKey: ['vested', contractHash, lockId],
    queryFn: () => {
      if (lockId == null) return 0n;
      if (isDemoVault(contractHash)) return demoVested(lockId);
      return contract.vestedAmount(contractHash, lockId);
    },
    enabled: !!contractHash && lockId != null,
    refetchInterval: 15_000,
  });
}

export function useClaimable(contractHash: string, lockId: number | undefined) {
  return useQuery<bigint>({
    queryKey: ['claimable', contractHash, lockId],
    queryFn: () => {
      if (lockId == null) return 0n;
      if (isDemoVault(contractHash)) return demoClaimable(lockId);
      return contract.claimableAmount(contractHash, lockId);
    },
    enabled: !!contractHash && lockId != null,
    refetchInterval: 15_000,
  });
}

export function useClaimableForLocks(contractHash: string, lockIds: number[]): Record<number, bigint | undefined> {
  const queries = useQueries({
    queries: lockIds.map((id) => ({
      queryKey: ['claimable', contractHash, id],
      queryFn: (): Promise<bigint> | bigint => {
        if (isDemoVault(contractHash)) return demoClaimable(id);
        return contract.claimableAmount(contractHash, id);
      },
      enabled: !!contractHash,
      refetchInterval: 15_000,
    })),
  });
  const out: Record<number, bigint | undefined> = {};
  lockIds.forEach((id, i) => { out[id] = queries[i].data; });
  return out;
}

export function useNow(intervalMs = 15_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** The vault owner — the address authorized to deposit / create new locks. */
export function useOwner(contractHash: string) {
  return useQuery({
    queryKey: ['owner', contractHash],
    queryFn: () => (isDemoVault(contractHash) ? DEMO_OWNER : contract.getOwner(contractHash)),
    enabled: !!contractHash,
    staleTime: 60 * 60 * 1000,
  });
}

export function useTotalLocked(contractHash: string, tokenHash: string | undefined) {
  return useQuery<bigint>({
    queryKey: ['totalLocked', contractHash, tokenHash],
    queryFn: () => {
      if (!tokenHash) return 0n;
      if (isDemoVault(contractHash)) return DEMO_LOCKS.reduce((s, l) => s + l.amountRaw, 0n);
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
      if (tokenHash.toLowerCase().endsWith('a6b7c812')) return DEMO_TOKEN;
      return contract.getTokenInfo(tokenHash);
    },
    enabled: !!tokenHash,
    staleTime: 60 * 60 * 1000,
  });
}

/**
 * Batch NEP-17 metadata fetch — one query per unique token hash. Returns a
 * lookup map `{ [hash]: TokenInfo | null }` once all in-flight requests
 * settle. Use this when a vault may hold multiple tokens.
 */
export function useTokenInfos(tokenHashes: string[]): Record<string, TokenInfo | null> {
  const unique = Array.from(new Set(tokenHashes.filter(Boolean)));
  const queries = useQueries({
    queries: unique.map((hash) => ({
      queryKey: ['tokenInfo', hash],
      queryFn: () => {
        if (hash.toLowerCase().endsWith('a6b7c812')) return DEMO_TOKEN;
        return contract.getTokenInfo(hash);
      },
      staleTime: 60 * 60 * 1000,
    })),
  });
  const out: Record<string, TokenInfo | null> = {};
  unique.forEach((hash, i) => {
    out[hash] = (queries[i].data as TokenInfo | null | undefined) ?? null;
  });
  return out;
}

export function useAggregateTokenMeta(locks: { token?: string }[]): {
  decimals: number | undefined;
  symbol: string;
} {
  const tokens = locks.map((l) => l.token).filter((t): t is string => !!t);
  const infos = useTokenInfos(tokens);
  const unique = Array.from(new Set(tokens));
  if (unique.length !== 1) return { decimals: undefined, symbol: '' };
  const info = infos[unique[0]];
  return { decimals: info?.decimals, symbol: info?.symbol ? ` ${info.symbol}` : '' };
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
