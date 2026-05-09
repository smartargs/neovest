/**
 * TanStack Query hooks. Each hook accepts a `contractHash` and falls back to
 * the canned mock data when the hash matches the bundled demo contract — so
 * the dashboard renders out-of-the-box without anything deployed, while real
 * deployments trigger live RPC reads.
 */

import { useQuery } from '@tanstack/react-query';
import { CONTRACT as DEMO_CONTRACT, LOCKS as MOCK_LOCKS, TOKEN as MOCK_TOKEN } from './data';
import * as contract from './contract';
import type { Lock } from './types';

/** Adapt a mock-data lock (short field names) to the canonical {@link Lock}. */
function adaptMock(m: (typeof MOCK_LOCKS)[number]): Lock {
  return {
    id: m.id,
    depositor: m.dep,
    beneficiary: m.ben,
    token: DEMO_CONTRACT, // mock data is single-token; pretend the demo contract is also the token
    amount: m.amount,
    claimed: m.claimed ?? 0,
    type: m.type,
    start: m.start,
    end: m.end,
    cliff: m.cliff,
    steps: m.steps,
    category: m.cat,
    note: m.label,
    createdAt: m.start,
    revocable: m.rev,
    revoked: false,

    // Backward-compat aliases used by some existing components.
    cat: m.cat,
    ben: m.ben,
    dep: m.dep,
    rev: m.rev,
    label: m.label,
  };
}

const isDemo = (contractHash: string) =>
  contractHash === DEMO_CONTRACT || contractHash === DEMO_CONTRACT.replace(/^0x/, '');

// ---------- Read hooks ----------

export function useLockCount(contractHash: string) {
  return useQuery({
    queryKey: ['lockCount', contractHash],
    queryFn: () => (isDemo(contractHash) ? MOCK_LOCKS.length : contract.getLockCount(contractHash)),
    enabled: !!contractHash,
  });
}

export function useLock(contractHash: string, lockId: number | undefined) {
  return useQuery({
    queryKey: ['lock', contractHash, lockId],
    queryFn: () => {
      if (lockId == null) return null;
      if (isDemo(contractHash)) {
        const m = MOCK_LOCKS.find((l) => l.id === lockId);
        return m ? adaptMock(m) : null;
      }
      return contract.getLock(contractHash, lockId);
    },
    enabled: !!contractHash && lockId != null,
  });
}

/** All locks in the vault — used by the dashboard table + timeline. */
export function useAllLocks(contractHash: string) {
  return useQuery({
    queryKey: ['allLocks', contractHash],
    queryFn: () => {
      if (isDemo(contractHash)) return MOCK_LOCKS.map(adaptMock);
      return contract.getAllLocks(contractHash);
    },
    enabled: !!contractHash,
  });
}

export function useVested(contractHash: string, lockId: number | undefined) {
  return useQuery({
    queryKey: ['vested', contractHash, lockId],
    queryFn: () => {
      if (lockId == null) return 0;
      if (isDemo(contractHash)) {
        const m = MOCK_LOCKS.find((l) => l.id === lockId);
        if (!m) return 0;
        // Live mock vesting from data.vestedAt
        const now = new Date();
        return import('./data').then(({ vestedAt }) => vestedAt(m, now));
      }
      return contract.vestedAmount(contractHash, lockId);
    },
    enabled: !!contractHash && lockId != null,
  });
}

export function useClaimable(contractHash: string, lockId: number | undefined) {
  return useQuery({
    queryKey: ['claimable', contractHash, lockId],
    queryFn: async () => {
      if (lockId == null) return 0;
      if (isDemo(contractHash)) {
        const m = MOCK_LOCKS.find((l) => l.id === lockId);
        if (!m) return 0;
        const { vestedAt } = await import('./data');
        const v = vestedAt(m, new Date());
        return Math.max(0, v - (m.claimed ?? 0));
      }
      return contract.claimableAmount(contractHash, lockId);
    },
    enabled: !!contractHash && lockId != null,
  });
}

export function useTotalLocked(contractHash: string, tokenHash: string | undefined) {
  return useQuery({
    queryKey: ['totalLocked', contractHash, tokenHash],
    queryFn: () => {
      if (!tokenHash) return 0;
      if (isDemo(contractHash)) {
        return MOCK_LOCKS.reduce((s, l) => s + l.amount, 0);
      }
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
      if (isDemo(contractHash)) {
        return MOCK_LOCKS.filter((l) => l.ben === beneficiary).map((l) => l.id);
      }
      return contract.getLocksByBeneficiary(contractHash, beneficiary);
    },
    enabled: !!contractHash && !!beneficiary,
  });
}

export function useLocksByDepositor(contractHash: string, depositor: string | undefined) {
  return useQuery({
    queryKey: ['locksByDepositor', contractHash, depositor],
    queryFn: () => {
      if (!depositor) return [] as number[];
      if (isDemo(contractHash)) {
        return MOCK_LOCKS.filter((l) => l.dep === depositor).map((l) => l.id);
      }
      return contract.getLocksByDepositor(contractHash, depositor);
    },
    enabled: !!contractHash && !!depositor,
  });
}

/** Re-export the demo-contract token info for views that want to display it. */
export { MOCK_TOKEN as DemoToken };
export const DEMO_CONTRACT_HASH = DEMO_CONTRACT;
