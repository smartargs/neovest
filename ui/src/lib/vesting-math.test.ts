import { describe, it, expect } from 'vitest';
import { nextUnlockDate, vestedAt, type ScheduleInput } from './vesting-math';

const D = (s: string) => new Date(s + 'T00:00:00Z');

describe('vestedAt — stepped', () => {
  const lock: ScheduleInput = {
    type: 'stepped',
    amount: 100,
    start: D('2030-01-01'),
    end: D('2030-04-01'),
    tranches: [
      { ts: D('2030-01-01'), amount: 25 },
      { ts: D('2030-02-01'), amount: 25 },
      { ts: D('2030-03-01'), amount: 25 },
      { ts: D('2030-04-01'), amount: 25 },
    ],
  };

  it('counts every tranche whose timestamp has passed, including the first at start', () => {
    expect(vestedAt(lock, D('2029-12-31'))).toBe(0);
    expect(vestedAt(lock, D('2030-01-01'))).toBe(25);
    expect(vestedAt(lock, D('2030-02-15'))).toBe(50);
    expect(vestedAt(lock, D('2030-04-01'))).toBe(100);
  });

  it('reports the next tranche date', () => {
    expect(nextUnlockDate(lock, D('2030-02-15'))).toEqual(D('2030-03-01'));
    expect(nextUnlockDate(lock, D('2030-04-01'))).toBeNull();
  });

  it('vests nothing when the tranche list is unavailable', () => {
    expect(vestedAt({ ...lock, tranches: undefined }, D('2030-04-01'))).toBe(0);
  });
});

describe('vestedAt — revoked locks', () => {
  it('freezes at the reduced total from the moment of revocation', () => {
    const lock: ScheduleInput = {
      type: 'linear',
      amount: 50,
      start: D('2030-01-01'),
      end: D('2031-01-01'),
      revoked: true,
      revokedAt: D('2030-07-02'),
    };
    expect(vestedAt(lock, D('2031-06-01'))).toBe(50);
    expect(vestedAt(lock, D('2030-07-02'))).toBe(50);
    expect(vestedAt(lock, D('2030-04-02'))).toBe(25);
    expect(nextUnlockDate(lock, D('2030-04-02'))).toBeNull();
  });

  it('returns zero for a cliff revoked before its date', () => {
    const lock: ScheduleInput = {
      type: 'cliff', amount: 0, start: D('2031-01-01'), end: D('2031-01-01'),
      revoked: true, revokedAt: D('2030-01-01'),
    };
    expect(vestedAt(lock, D('2032-01-01'))).toBe(0);
  });
});

describe('vestedAt — cliff and linear', () => {
  it('cliff unlocks everything at the start timestamp', () => {
    const lock: ScheduleInput = { type: 'cliff', amount: 10, start: D('2030-01-01'), end: D('2030-01-01') };
    expect(vestedAt(lock, new Date(D('2030-01-01').getTime() - 1))).toBe(0);
    expect(vestedAt(lock, D('2030-01-01'))).toBe(10);
  });

  it('linear with cliff is flat, then proportional, then full', () => {
    const lock: ScheduleInput = {
      type: 'linear', amount: 1000, start: D('2030-01-01'), end: D('2034-01-01'), cliff: D('2031-01-01'),
    };
    expect(vestedAt(lock, D('2030-12-31'))).toBe(0);
    expect(vestedAt(lock, D('2031-01-01'))).toBe(Math.floor(1000 * (365 / 1461)));
    expect(vestedAt(lock, D('2034-01-01'))).toBe(1000);
  });
});
