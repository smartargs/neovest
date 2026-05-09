/**
 * Mock data layer. Believable invented token + 30-50 vesting positions across
 * 6 categories. Replace with on-chain reads (TanStack Query against neon-js)
 * when wiring the real contract.
 */

import type { ScheduleType } from './vesting-math';
import { vestedAt } from './vesting-math';

export interface Token {
  symbol: string;
  name: string;
  totalSupply: number;
  decimals: number;
}

export interface Category {
  id: CategoryId;
  name: string;
  color: string;
}

export type CategoryId = 'team' | 'investor' | 'treasury' | 'public' | 'advisor' | 'partner';

export interface Lock {
  id: number;
  cat: CategoryId;
  ben: string;
  label: string;
  dep: string;
  amount: number;
  type: ScheduleType;
  start: Date;
  end: Date;
  cliff?: Date;
  steps?: number;
  rev: boolean;
  claimed?: number;
}

export interface TimelineSeries {
  [catId: string]: { t: Date; v: number }[];
}

export const TOKEN: Token = {
  symbol: 'LTC',
  name: 'Lattice',
  totalSupply: 12_000_000_000,
  decimals: 8,
};

export const CONTRACT = '0x7f3a4e8b9d2f1c5a6b8e9d3f2a1c4b7e2c1';
export const SHORT = '0x7f3a...e2c1';
export const NETWORK = 'Mainnet';

/** The "today" the design was built around. Real app: `new Date()`. */
export const TODAY = new Date('2026-05-09T00:00:00Z');

export const CATEGORIES: Category[] = [
  { id: 'team',     name: 'Team',      color: 'var(--cat-team)' },
  { id: 'investor', name: 'Investors', color: 'var(--cat-investor)' },
  { id: 'treasury', name: 'Treasury',  color: 'var(--cat-treasury)' },
  { id: 'public',   name: 'Public',    color: 'var(--cat-public)' },
  { id: 'advisor',  name: 'Advisors',  color: 'var(--cat-advisor)' },
  { id: 'partner',  name: 'Partners',  color: 'var(--cat-partner)' },
];

const D = (s: string) => new Date(s + 'T00:00:00Z');

export const LOCKS: Lock[] = [
  // Team (founders + leads)
  { id: 1,  cat: 'team',     ben: '0xA1b3...3Bf2', label: 'Alice (CEO)',           dep: '0xF7c2...91ad', amount: 1_200_000_000, type: 'linear', start: D('2025-09-15'), end: D('2029-09-15'), cliff: D('2026-09-15'), rev: false, claimed: 0 },
  { id: 2,  cat: 'team',     ben: '0xB4d8...7Ac1', label: 'Bao (CTO)',             dep: '0xF7c2...91ad', amount:   900_000_000, type: 'linear', start: D('2025-09-15'), end: D('2029-09-15'), cliff: D('2026-09-15'), rev: false, claimed: 0 },
  { id: 3,  cat: 'team',     ben: '0xC9e4...1Df0', label: 'Chen (Head of Eng)',    dep: '0xF7c2...91ad', amount:   600_000_000, type: 'linear', start: D('2025-10-01'), end: D('2029-10-01'), cliff: D('2026-10-01'), rev: false, claimed: 0 },
  { id: 4,  cat: 'team',     ben: '0xD3a7...8E29', label: 'Dara (Design lead)',    dep: '0xF7c2...91ad', amount:   320_000_000, type: 'linear', start: D('2025-11-12'), end: D('2029-11-12'), cliff: D('2026-11-12'), rev: false, claimed: 0 },
  { id: 5,  cat: 'team',     ben: '0xE6b1...0F44', label: 'Emi (Eng)',             dep: '0xF7c2...91ad', amount:   180_000_000, type: 'linear', start: D('2026-01-08'), end: D('2030-01-08'), cliff: D('2027-01-08'), rev: false, claimed: 0 },
  { id: 6,  cat: 'team',     ben: '0xF8c5...2A1d', label: 'Felix (Eng)',           dep: '0xF7c2...91ad', amount:   180_000_000, type: 'linear', start: D('2026-02-14'), end: D('2030-02-14'), cliff: D('2027-02-14'), rev: false, claimed: 0 },
  { id: 7,  cat: 'team',     ben: '0xA1b3...3Bf2', label: 'Alice — performance',   dep: '0xF7c2...91ad', amount:   220_000_000, type: 'stepped', start: D('2026-03-01'), end: D('2030-03-01'), steps: 8, rev: true, claimed: 0 },

  // Investors
  { id: 10, cat: 'investor', ben: '0x9Bc3...e1c4', label: 'Acme Capital',          dep: '0xF7c2...91ad', amount: 500_000_000, type: 'linear', start: D('2026-03-15'), end: D('2028-03-15'), cliff: D('2027-03-15'), rev: false, claimed: 0 },
  { id: 11, cat: 'investor', ben: '0x4Ee7...88a2', label: 'Polaris Ventures',      dep: '0xF7c2...91ad', amount: 420_000_000, type: 'linear', start: D('2026-03-15'), end: D('2028-03-15'), cliff: D('2027-03-15'), rev: false, claimed: 0 },
  { id: 12, cat: 'investor', ben: '0x2Df1...c4b9', label: 'Lighthouse Cap.',       dep: '0xF7c2...91ad', amount: 280_000_000, type: 'linear', start: D('2026-04-01'), end: D('2028-04-01'), cliff: D('2027-04-01'), rev: false, claimed: 0 },
  { id: 13, cat: 'investor', ben: '0xCa86...44f0', label: 'Greenfield',            dep: '0xF7c2...91ad', amount: 200_000_000, type: 'cliff',  start: D('2026-04-01'), end: D('2027-04-01'), rev: false, claimed: 0 },
  { id: 14, cat: 'investor', ben: '0x9Bc3...e1c4', label: 'Acme Capital — series B', dep: '0xF7c2...91ad', amount: 150_000_000, type: 'linear', start: D('2026-09-01'), end: D('2028-09-01'), cliff: D('2027-09-01'), rev: false, claimed: 0 },
  { id: 15, cat: 'investor', ben: '0x71b5...A12c', label: 'Nimbus Partners',       dep: '0xF7c2...91ad', amount: 120_000_000, type: 'linear', start: D('2026-09-01'), end: D('2028-09-01'), cliff: D('2027-09-01'), rev: false, claimed: 0 },
  { id: 16, cat: 'investor', ben: '0xCa86...44f0', label: 'Greenfield — strategic',dep: '0xF7c2...91ad', amount:  80_000_000, type: 'cliff',  start: D('2026-12-01'), end: D('2028-06-01'), rev: false, claimed: 0 },

  // Treasury (DAO)
  { id: 20, cat: 'treasury', ben: '0x4C2a...8f1a', label: 'DAO Treasury',          dep: '0xF7c2...91ad', amount: 2_000_000_000, type: 'stepped', start: D('2026-01-01'), end: D('2030-01-01'), steps: 8, rev: false, claimed: 250_000_000 },
  { id: 21, cat: 'treasury', ben: '0x4C2a...8f1a', label: 'Ecosystem grants',      dep: '0xF7c2...91ad', amount:   600_000_000, type: 'linear',  start: D('2026-01-01'), end: D('2028-01-01'), rev: false, claimed: 80_000_000 },
  { id: 22, cat: 'treasury', ben: '0x4C2a...8f1a', label: 'Liquidity reserves',    dep: '0xF7c2...91ad', amount:   400_000_000, type: 'stepped', start: D('2026-01-01'), end: D('2027-07-01'), steps: 6, rev: false, claimed: 0 },
  { id: 23, cat: 'treasury', ben: '0x4C2a...8f1a', label: 'Bug bounty pool',       dep: '0xF7c2...91ad', amount:   100_000_000, type: 'linear',  start: D('2026-01-01'), end: D('2031-01-01'), rev: false, claimed: 12_000_000 },

  // Public sale
  { id: 30, cat: 'public',   ben: '0xPub1...0001', label: 'Public sale tranche 1', dep: '0xF7c2...91ad', amount: 380_000_000, type: 'cliff',  start: D('2026-02-15'), end: D('2026-05-15'), rev: false, claimed: 0 },
  { id: 31, cat: 'public',   ben: '0xPub2...0002', label: 'Public sale tranche 2', dep: '0xF7c2...91ad', amount: 250_000_000, type: 'linear', start: D('2026-02-15'), end: D('2026-08-15'), rev: false, claimed: 25_000_000 },
  { id: 32, cat: 'public',   ben: '0xPub3...0003', label: 'Community airdrop',     dep: '0xF7c2...91ad', amount: 120_000_000, type: 'cliff',  start: D('2026-05-15'), end: D('2026-05-15'), rev: false, claimed: 0 },

  // Advisors
  { id: 40, cat: 'advisor',  ben: '0xD9f3...12fe', label: 'Marcus J. (advisor)',   dep: '0xF7c2...91ad', amount:  60_000_000, type: 'linear', start: D('2026-01-15'), end: D('2028-01-15'), cliff: D('2026-07-15'), rev: true, claimed: 0 },
  { id: 41, cat: 'advisor',  ben: '0x88e2...7B11', label: 'Priya R. (advisor)',    dep: '0xF7c2...91ad', amount:  50_000_000, type: 'linear', start: D('2026-02-01'), end: D('2028-02-01'), cliff: D('2026-08-01'), rev: true, claimed: 0 },
  { id: 42, cat: 'advisor',  ben: '0x77b9...f3A4', label: 'Toshi K. (advisor)',    dep: '0xF7c2...91ad', amount:  40_000_000, type: 'linear', start: D('2026-03-01'), end: D('2028-03-01'), cliff: D('2026-09-01'), rev: true, claimed: 0 },
  { id: 43, cat: 'advisor',  ben: '0x21cd...e4D7', label: 'Wren O. (advisor)',     dep: '0xF7c2...91ad', amount:  30_000_000, type: 'linear', start: D('2026-04-01'), end: D('2028-04-01'), cliff: D('2026-10-01'), rev: true, claimed: 0 },

  // Partners
  { id: 50, cat: 'partner',  ben: '0x5a4b...8C9d', label: 'Lattice Bridge',        dep: '0xF7c2...91ad', amount: 180_000_000, type: 'stepped', start: D('2026-04-01'), end: D('2028-04-01'), steps: 4, rev: false, claimed: 0 },
  { id: 51, cat: 'partner',  ben: '0x9c1d...2E4f', label: 'NeoFi Foundation',      dep: '0xF7c2...91ad', amount: 120_000_000, type: 'linear',  start: D('2026-04-01'), end: D('2028-04-01'), rev: false, claimed: 0 },
  { id: 52, cat: 'partner',  ben: '0x6b8a...3D7e', label: 'Helix DEX',             dep: '0xF7c2...91ad', amount:  80_000_000, type: 'linear',  start: D('2026-06-01'), end: D('2028-06-01'), rev: false, claimed: 0 },
  { id: 53, cat: 'partner',  ben: '0x44ee...91Bd', label: 'Drift Wallet',          dep: '0xF7c2...91ad', amount:  60_000_000, type: 'linear',  start: D('2026-06-01'), end: D('2028-06-01'), rev: false, claimed: 0 },

  // Beneficiary view (the connected wallet) — Alice already has 1 & 7; add a small public-sale claim.
  { id: 60, cat: 'public',   ben: '0xA1b3...3Bf2', label: 'Public sale allocation',dep: '0xC418...7e21', amount:  12_000_000, type: 'linear', start: D('2026-02-15'), end: D('2026-08-15'), rev: false, claimed: 1_500_000 },
];

/** The connected wallet for the design's "manage" page. */
export const ME = '0xA1b3...3Bf2';

/** Re-export so call sites can import everything from `@/lib/data`. */
export { vestedAt };

/** Build cumulative-vested-by-category time series for the dashboard timeline chart. */
export function buildTimeline(start: Date, end: Date, points = 120): TimelineSeries {
  const series: TimelineSeries = {};
  CATEGORIES.forEach((c) => (series[c.id] = []));
  const stepMs = (end.getTime() - start.getTime()) / (points - 1);
  for (let i = 0; i < points; i++) {
    const when = new Date(start.getTime() + stepMs * i);
    CATEGORIES.forEach((c) => {
      const total = LOCKS.filter((l) => l.cat === c.id).reduce((s, l) => s + vestedAt(l, when), 0);
      series[c.id].push({ t: when, v: total });
    });
  }
  return series;
}

export function categoryColor(catId: CategoryId | string): string {
  return `var(--cat-${catId})`;
}

export function categoryName(catId: CategoryId | string): string {
  const map: Record<string, string> = {
    team: 'Team', investor: 'Investors', treasury: 'Treasury',
    public: 'Public', advisor: 'Advisors', partner: 'Partners', other: 'Other',
  };
  return map[catId] ?? catId;
}

export function scheduleSummary(lock: Lock): string {
  if (lock.type === 'cliff') return 'Cliff';
  if (lock.type === 'linear') {
    const yrs = Math.round((lock.end.getTime() - lock.start.getTime()) / (365.25 * 24 * 3600 * 1000));
    const cliffYrs = lock.cliff
      ? Math.round((lock.cliff.getTime() - lock.start.getTime()) / (365.25 * 24 * 3600 * 1000))
      : 0;
    return cliffYrs ? `Linear ${yrs}y / ${cliffYrs}y cliff` : `Linear ${yrs}y`;
  }
  if (lock.type === 'stepped') return `Stepped / ${lock.steps ?? 4} steps`;
  return lock.type;
}
