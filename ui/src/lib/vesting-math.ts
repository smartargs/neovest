/**
 * Pure schedule math, mirroring the on-chain contract (see docs/SCHEDULE.md).
 *
 * The contract and this file MUST agree on every input. They share test
 * vectors via contract/src/test/.../schedule-vectors.json once both are
 * implemented; for now this drives the UI's mock data and live preview.
 */

export type ScheduleType = 'cliff' | 'linear' | 'stepped';

export interface ScheduleInput {
  type: ScheduleType;
  amount: number;
  start: Date;
  end: Date;
  /** Optional cliff for linear schedules. */
  cliff?: Date | null;
  /** Number of equal tranches for stepped schedules. */
  steps?: number;
}

export function vestedAt(lock: ScheduleInput, when: Date): number {
  const t = when.getTime();
  const s = lock.start.getTime();
  const e = lock.end.getTime();

  if (t <= s) return 0;
  if (t >= e) return lock.amount;

  if (lock.type === 'cliff') {
    return t >= e ? lock.amount : 0;
  }

  if (lock.type === 'linear') {
    if (lock.cliff && t < lock.cliff.getTime()) return 0;
    const frac = (t - s) / (e - s);
    return Math.floor(lock.amount * frac);
  }

  if (lock.type === 'stepped') {
    const steps = lock.steps ?? 4;
    const stepDur = (e - s) / steps;
    const stepsPassed = Math.floor((t - s) / stepDur);
    const clamped = Math.min(steps, Math.max(0, stepsPassed));
    return Math.floor((lock.amount * clamped) / steps);
  }

  return 0;
}

/** When does this lock next produce a vesting event after `today`? */
export function nextUnlockDate(lock: ScheduleInput, today: Date): Date | null {
  if (lock.end <= today) return null;
  if (lock.type === 'cliff') return lock.end;
  if (lock.type === 'linear') {
    if (lock.cliff && lock.cliff > today) return lock.cliff;
    const n = new Date(today);
    n.setUTCDate(1);
    n.setUTCMonth(n.getUTCMonth() + 1);
    return n < lock.end ? n : lock.end;
  }
  if (lock.type === 'stepped') {
    const steps = lock.steps ?? 4;
    const stepDur = (lock.end.getTime() - lock.start.getTime()) / steps;
    for (let i = 1; i <= steps; i++) {
      const t = new Date(lock.start.getTime() + i * stepDur);
      if (t > today) return t;
    }
  }
  return null;
}
