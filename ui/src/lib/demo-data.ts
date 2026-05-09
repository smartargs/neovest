/**
 * Canned dataset for screenshot/demo purposes. Activated when the URL is
 * `/v/demo`. Contains a believable Neo N3 token vault with ~25 locks across
 * the standard 6 categories. All addresses are valid base58 Neo3 forms; the
 * token + contract hashes are invented but format-correct.
 */

import type { Lock } from './types';
import type { TokenInfo } from './contract';

export const DEMO_HASH = 'demo';

export const DEMO_TOKEN: TokenInfo = {
  symbol: 'HYPR',
  decimals: 8,
  // 10 B HYPR fixed supply.
  totalSupply: 10_000_000_000 * 100_000_000,
};

const DEMO_TOKEN_HASH = '0x9c51fb6a3e5f841d72d3a8c9b1e2d4f5a6b7c812';

/** Today, baked in so the dashboard shows a meaningful snapshot. */
const TODAY = new Date('2026-05-09T12:00:00Z');

/** Helper: ISO date string → Date, UTC midnight. */
const D = (s: string) => new Date(s + 'T00:00:00Z');

interface DemoLockSeed {
  id: number;
  cat: string;
  ben: string;
  benLabel: string;
  amount: number; // whole HYPR; multiplied by 10^8 below
  type: 'cliff' | 'linear';
  start: Date;
  end: Date;
  cliff?: Date;
  rev: boolean;
  /** Whole HYPR claimed; multiplied by 10^8 below. */
  claimed?: number;
}

const DEPOSITOR = 'NgKjbKVTfeEWNtPj8YT8nrXrTfXkGjAANQ';

const SEEDS: DemoLockSeed[] = [
  // Team (4y / 1y cliff)
  { id: 1,  cat: 'team',     ben: 'NRBn1xvQk9hL3DqjZpbZvA4WgfwNxL5aXa', benLabel: 'Alice (CEO)',         amount: 1_200_000_000, type: 'linear', start: D('2025-09-15'), end: D('2029-09-15'), cliff: D('2026-09-15'), rev: false },
  { id: 2,  cat: 'team',     ben: 'Nb6c2sFt9zKvL9Y8mRpNxWyZ4hT5Xkd2Pa', benLabel: 'Bao (CTO)',           amount:   900_000_000, type: 'linear', start: D('2025-09-15'), end: D('2029-09-15'), cliff: D('2026-09-15'), rev: false },
  { id: 3,  cat: 'team',     ben: 'NfPzL2dQa5XkV7nB8yKrW3JvT9cM1eR4Xz', benLabel: 'Chen (Head of Eng)',  amount:   600_000_000, type: 'linear', start: D('2025-10-01'), end: D('2029-10-01'), cliff: D('2026-10-01'), rev: false },
  { id: 4,  cat: 'team',     ben: 'NSx7Jq5KvDnH9Z3FbN4TpWmL8gR2cY6Vke', benLabel: 'Dara (Design lead)',  amount:   320_000_000, type: 'linear', start: D('2025-11-12'), end: D('2029-11-12'), cliff: D('2026-11-12'), rev: false },
  { id: 5,  cat: 'team',     ben: 'NhTzA9pKLrVxNjY7Bm4dQ8fWz3Cs5Ej2Xv', benLabel: 'Emi (Senior Eng)',    amount:   180_000_000, type: 'linear', start: D('2026-01-08'), end: D('2030-01-08'), cliff: D('2027-01-08'), rev: false },
  { id: 6,  cat: 'team',     ben: 'NkPvFyR7BqXnTjZ3Lc8WdM2hG5JaY9Ds6E', benLabel: 'Felix (Senior Eng)',  amount:   180_000_000, type: 'linear', start: D('2026-02-14'), end: D('2030-02-14'), cliff: D('2027-02-14'), rev: false },
  { id: 7,  cat: 'team',     ben: 'NRBn1xvQk9hL3DqjZpbZvA4WgfwNxL5aXa', benLabel: 'Alice — performance', amount:   220_000_000, type: 'linear', start: D('2026-03-01'), end: D('2030-03-01'),                          rev: true  },

  // Investors (2y / 1y cliff)
  { id: 10, cat: 'investor', ben: 'NTfM3dV9jBpKsXc7Wn2QyLh4Rg8Ek5JaXy', benLabel: 'Acme Capital',          amount: 500_000_000, type: 'linear', start: D('2026-03-15'), end: D('2028-03-15'), cliff: D('2027-03-15'), rev: false },
  { id: 11, cat: 'investor', ben: 'NUz4PqHv7RkD3JmBn6XaFtY8Lc2Wg5Jx9N', benLabel: 'Polaris Ventures',      amount: 420_000_000, type: 'linear', start: D('2026-03-15'), end: D('2028-03-15'), cliff: D('2027-03-15'), rev: false },
  { id: 12, cat: 'investor', ben: 'NgD8fK3LpYvX9Jb4Rs7Wm5HcN2Ta6Q1Zky', benLabel: 'Lighthouse Capital',    amount: 280_000_000, type: 'linear', start: D('2026-04-01'), end: D('2028-04-01'), cliff: D('2027-04-01'), rev: false },
  { id: 13, cat: 'investor', ben: 'NmKv5RyPxL7T2Jb3Wn8FdCe9Sa4Gh1Qz6X', benLabel: 'Greenfield',            amount: 200_000_000, type: 'cliff',  start: D('2027-04-01'), end: D('2027-04-01'),                          rev: false },
  { id: 14, cat: 'investor', ben: 'NTfM3dV9jBpKsXc7Wn2QyLh4Rg8Ek5JaXy', benLabel: 'Acme — series B',       amount: 150_000_000, type: 'linear', start: D('2026-09-01'), end: D('2028-09-01'), cliff: D('2027-09-01'), rev: false },
  { id: 15, cat: 'investor', ben: 'NwH4cKvDpRy8Jb6Tn3FeXa2Lg5Zk9Sm1Q7', benLabel: 'Nimbus Partners',       amount: 120_000_000, type: 'linear', start: D('2026-09-01'), end: D('2028-09-01'), cliff: D('2027-09-01'), rev: false },
  { id: 16, cat: 'investor', ben: 'NmKv5RyPxL7T2Jb3Wn8FdCe9Sa4Gh1Qz6X', benLabel: 'Greenfield — strategic',amount:  80_000_000, type: 'cliff',  start: D('2028-06-01'), end: D('2028-06-01'),                          rev: false },

  // Treasury / DAO
  { id: 20, cat: 'treasury', ben: 'NaTrEa5uRyDaO7VhX2Wg9JmBn4Pc3Sk1Q6', benLabel: 'DAO Treasury',          amount: 2_000_000_000, type: 'linear', start: D('2026-01-01'), end: D('2030-01-01'),                          rev: false, claimed: 250_000_000 },
  { id: 21, cat: 'treasury', ben: 'NaTrEa5uRyDaO7VhX2Wg9JmBn4Pc3Sk1Q6', benLabel: 'Ecosystem grants',      amount:   600_000_000, type: 'linear', start: D('2026-01-01'), end: D('2028-01-01'),                          rev: false, claimed:  80_000_000 },
  { id: 22, cat: 'treasury', ben: 'NaTrEa5uRyDaO7VhX2Wg9JmBn4Pc3Sk1Q6', benLabel: 'Liquidity reserves',    amount:   400_000_000, type: 'linear', start: D('2026-01-01'), end: D('2027-07-01'),                          rev: false },
  { id: 23, cat: 'treasury', ben: 'NaTrEa5uRyDaO7VhX2Wg9JmBn4Pc3Sk1Q6', benLabel: 'Bug bounty pool',       amount:   100_000_000, type: 'linear', start: D('2026-01-01'), end: D('2031-01-01'),                          rev: false, claimed:  12_000_000 },

  // Public sale
  { id: 30, cat: 'public',   ben: 'NPub1Tr4nChEzVxKyBnWj3Lc7Hm2Rk9Sa5', benLabel: 'Public sale T1',        amount: 380_000_000, type: 'cliff',  start: D('2026-05-15'), end: D('2026-05-15'),                          rev: false },
  { id: 31, cat: 'public',   ben: 'NPub2Tr4nChEzWxKyBnYj3Lc7Hm2Rk9Sa6', benLabel: 'Public sale T2',        amount: 250_000_000, type: 'linear', start: D('2026-02-15'), end: D('2026-08-15'),                          rev: false, claimed:  25_000_000 },
  { id: 32, cat: 'public',   ben: 'NCom1uniTyA1rDr0pXyZBnHj4Lc7Mk2Sa9', benLabel: 'Community airdrop',     amount: 120_000_000, type: 'cliff',  start: D('2026-05-15'), end: D('2026-05-15'),                          rev: false },

  // Advisors (2y / 6mo cliff, smaller amounts)
  { id: 40, cat: 'advisor',  ben: 'NaDvIs0r1MaR2cuS3JnHzKv5Tb8Lc4Wm6X', benLabel: 'Marcus J.',             amount:  60_000_000, type: 'linear', start: D('2026-01-15'), end: D('2028-01-15'), cliff: D('2026-07-15'), rev: true  },
  { id: 41, cat: 'advisor',  ben: 'NaDvIs0r2PrIyA3RaJnHkLv6Tc9Md5Xn7Y', benLabel: 'Priya R.',              amount:  50_000_000, type: 'linear', start: D('2026-02-01'), end: D('2028-02-01'), cliff: D('2026-08-01'), rev: true  },
  { id: 42, cat: 'advisor',  ben: 'NaDvIs0r3T0ShIK4taJnLkMv7Vd3Pe6Yn8Z', benLabel: 'Toshi K.',              amount:  40_000_000, type: 'linear', start: D('2026-03-01'), end: D('2028-03-01'), cliff: D('2026-09-01'), rev: true  },
  { id: 43, cat: 'advisor',  ben: 'NaDvIs0r4WrEnO5MoJnLkPv8Wd4Qe7Zn9Ka', benLabel: 'Wren O.',               amount:  30_000_000, type: 'linear', start: D('2026-04-01'), end: D('2028-04-01'), cliff: D('2026-10-01'), rev: true  },

  // Partners
  { id: 50, cat: 'partner',  ben: 'NPaRtN3rL4tT1cE5BrXjJk2Mb9Nz4Hg6Vc7', benLabel: 'Lattice Bridge',        amount: 180_000_000, type: 'linear', start: D('2026-04-01'), end: D('2028-04-01'),                          rev: false },
  { id: 51, cat: 'partner',  ben: 'NPaRtN3rN5oFi6Fnd2WtJk8Mb3Nz5Hg7Vc8', benLabel: 'NeoFi Foundation',      amount: 120_000_000, type: 'linear', start: D('2026-04-01'), end: D('2028-04-01'),                          rev: false },
  { id: 52, cat: 'partner',  ben: 'NPaRtN3rH7eLiX8DexJk9Mb4Nz6Hg8Vc9We', benLabel: 'Helix DEX',             amount:  80_000_000, type: 'linear', start: D('2026-06-01'), end: D('2028-06-01'),                          rev: false },
  { id: 53, cat: 'partner',  ben: 'NPaRtN3rDr1FtW2aLeT9Mb5Nz7Hg9Vc1Pq3', benLabel: 'Drift Wallet',          amount:  60_000_000, type: 'linear', start: D('2026-06-01'), end: D('2028-06-01'),                          rev: false },
];

const HYPR = 100_000_000;

/** Adapt a seed into the full {@link Lock} shape used by the dashboard. */
function expand(seed: DemoLockSeed): Lock {
  return {
    id: seed.id,
    depositor: DEPOSITOR,
    beneficiary: seed.ben,
    token: DEMO_TOKEN_HASH,
    amount: seed.amount * HYPR,
    claimed: (seed.claimed ?? 0) * HYPR,
    type: seed.type,
    start: seed.start,
    end: seed.end,
    cliff: seed.cliff,
    category: seed.cat,
    note: seed.benLabel,
    createdAt: seed.start,
    revocable: seed.rev,
    revoked: false,
    // Backward-compat aliases the UI components still read:
    cat: seed.cat,
    ben: seed.ben,
    dep: DEPOSITOR,
    label: seed.benLabel,
    rev: seed.rev,
  };
}

export const DEMO_LOCKS: Lock[] = SEEDS.map(expand);

export const DEMO_OWNER = DEPOSITOR;

export const DEMO_TODAY = TODAY;

export function isDemoVault(contractHash: string | undefined): boolean {
  if (!contractHash) return false;
  const h = contractHash.toLowerCase();
  return h === DEMO_HASH || h === '0x' + DEMO_HASH;
}
