/**
 * Display-side types + category metadata. Pure UI helpers — no mock data;
 * lock contents come from the on-chain hooks in `lib/hooks.ts`.
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
  cat: CategoryId | string;
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
  token?: string;
}

export interface TimelineSeries {
  [catId: string]: { t: Date; v: number }[];
}

export const CATEGORIES: Category[] = [
  { id: 'team',     name: 'Team',      color: 'var(--cat-team)' },
  { id: 'investor', name: 'Investors', color: 'var(--cat-investor)' },
  { id: 'treasury', name: 'Treasury',  color: 'var(--cat-treasury)' },
  { id: 'public',   name: 'Public',    color: 'var(--cat-public)' },
  { id: 'advisor',  name: 'Advisors',  color: 'var(--cat-advisor)' },
  { id: 'partner',  name: 'Partners',  color: 'var(--cat-partner)' },
];

/** Re-export so call sites can import everything from `@/lib/data`. */
export { vestedAt };

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
