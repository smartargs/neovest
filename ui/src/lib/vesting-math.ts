/**
 * Pure schedule math, mirroring the on-chain contract (see docs/SCHEDULE.md).
 *
 * Stepped schedules are evaluated from the lock's decoded tranche list, which
 * is what the contract reads; a revoked lock is frozen at its reduced total
 * from the moment of revocation.
 */

export type ScheduleType = 'cliff' | 'linear' | 'stepped';

export interface ScheduleTranche {
  ts: Date;
  amount: number;
}

export interface ScheduleInput {
  type: ScheduleType;
  amount: number;
  start: Date;
  end: Date;
  cliff?: Date | null;
  tranches?: ScheduleTranche[];
  revoked?: boolean;
  revokedAt?: Date;
}

export function vestedAt(lock: ScheduleInput, when: Date): number {
  const t = when.getTime();
  if (lock.revoked && (!lock.revokedAt || t >= lock.revokedAt.getTime())) return lock.amount;

  if (lock.type === 'cliff') {
    return t >= lock.start.getTime() ? lock.amount : 0;
  }

  if (lock.type === 'linear') {
    const frac = linearFraction(lock, t);
    if (lock.revoked && lock.revokedAt) {
      const fracAtRevoke = linearFraction(lock, lock.revokedAt.getTime());
      return fracAtRevoke > 0 ? Math.floor((lock.amount * frac) / fracAtRevoke) : 0;
    }
    return Math.floor(lock.amount * frac);
  }

  if (lock.type === 'stepped') {
    let sum = 0;
    for (const tranche of lock.tranches ?? []) {
      if (tranche.ts.getTime() <= t) sum += tranche.amount;
    }
    return Math.min(sum, lock.amount);
  }

  return 0;
}

function linearFraction(lock: ScheduleInput, t: number): number {
  const s = lock.start.getTime();
  const e = lock.end.getTime();
  if (lock.cliff && t < lock.cliff.getTime()) return 0;
  if (t >= e) return 1;
  if (t < s || e <= s) return 0;
  return (t - s) / (e - s);
}

/** When does this lock next produce a vesting event after `today`? */
export function nextUnlockDate(lock: ScheduleInput, today: Date): Date | null {
  if (lock.revoked) return null;
  if (lock.type === 'cliff') return lock.start > today ? lock.start : null;
  if (lock.end <= today) return null;
  if (lock.type === 'linear') {
    if (lock.cliff && lock.cliff > today) return lock.cliff;
    const n = new Date(today);
    n.setUTCDate(1);
    n.setUTCMonth(n.getUTCMonth() + 1);
    return n < lock.end ? n : lock.end;
  }
  if (lock.type === 'stepped') {
    for (const tranche of lock.tranches ?? []) {
      if (tranche.ts > today) return tranche.ts;
    }
  }
  return null;
}
