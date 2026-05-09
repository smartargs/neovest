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

const KNOWN_CATEGORY_IDS: ReadonlySet<string> = new Set(CATEGORIES.map((c) => c.id));

/**
 * Category color. Built-in categories use the CSS variables defined for the
 * theme (`--cat-team`, etc.). Custom (free-form) categories get a stable
 * HSL color derived from the string itself, so the same custom name always
 * lands on the same hue.
 */
export function categoryColor(catId: CategoryId | string): string {
  if (KNOWN_CATEGORY_IDS.has(catId)) return `var(--cat-${catId})`;
  const hue = stringHue(String(catId));
  return `hsl(${hue} 60% 55%)`;
}

export function categoryName(catId: CategoryId | string): string {
  const map: Record<string, string> = {
    team: 'Team', investor: 'Investors', treasury: 'Treasury',
    public: 'Public', advisor: 'Advisors', partner: 'Partners', other: 'Other',
  };
  if (map[catId]) return map[catId];
  // Title-case a free-form category id for display.
  const s = String(catId).trim();
  if (!s) return 'Uncategorized';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Stable hash → 0..359 hue. djb2-ish; collisions are visually fine. */
function stringHue(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 360;
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
