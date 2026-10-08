import { describe, it, expect } from 'vitest';
import {
  parseAmount,
  parseLockForm,
  normalizeHashOrAddress,
  type ParsedLockForm,
  type RawLockForm,
} from './lock-form';

// Real native-token script hashes — what a user actually picks on Neo N3.
const NEO = '0xef4073a0f2b305a38ec4050e4d3d28bc40ea63f5'; // 0 decimals
const GAS = '0xd2a4cff31913016155e38e474a2c06d08be276cf'; // 8 decimals
const BENEFICIARY = '0x1111111111111111111111111111111111111111';

function makeForm(overrides: Partial<RawLockForm> = {}): RawLockForm {
  return {
    tokenInput: NEO,
    beneficiaryInput: BENEFICIARY,
    amountInput: '5',
    startInput: '2999-01-01T00:00',
    endInput: '2999-06-01T00:00',
    cliffInput: '',
    stepsInput: '4',
    categoryInput: 'team',
    noteInput: '',
    scheduleType: 'linear',
    revocable: false,
    decimals: 0,
    ...overrides,
  };
}

function expectOk(res: ParsedLockForm): Extract<ParsedLockForm, { ok: true }> {
  if (!res.ok) throw new Error(`expected ok, got error: ${res.error}`);
  return res;
}

describe('parseAmount — scales by the token decimals', () => {
  it('NEO (0 decimals): whole units pass through unchanged', () => {
    expect(parseAmount('5', 0)).toBe(5n);
    expect(parseAmount('1000', 0)).toBe(1000n);
  });

  it('GAS (8 decimals): scales by 1e8', () => {
    expect(parseAmount('5', 8)).toBe(500_000_000n);
    expect(parseAmount('1.5', 8)).toBe(150_000_000n);
    expect(parseAmount('0.00000001', 8)).toBe(1n);
  });

  it('custom token (2 decimals)', () => {
    expect(parseAmount('1.25', 2)).toBe(125n);
    expect(parseAmount('10', 2)).toBe(1000n);
  });

  it('strips thousands separators', () => {
    expect(parseAmount('1,000', 0)).toBe(1000n);
  });

  it('rejects more fractional digits than the token allows', () => {
    expect(parseAmount('5.5', 0)).toBeNull(); // NEO is indivisible
    expect(parseAmount('1.234', 2)).toBeNull();
  });

  it('rejects non-numeric input', () => {
    expect(parseAmount('abc', 8)).toBeNull();
    expect(parseAmount('', 8)).toBeNull();
  });
});

describe('parseLockForm — amount we pass differs per token', () => {
  it('NEO: "5" → 5 base units (0 decimals)', () => {
    const res = expectOk(parseLockForm(makeForm({ tokenInput: NEO, decimals: 0, amountInput: '5' })));
    expect(res.amountRaw).toBe(5n);
    expect(res.tokenHash).toBe(NEO);
  });

  it('GAS: "5" → 500,000,000 base units (8 decimals)', () => {
    const res = expectOk(parseLockForm(makeForm({ tokenInput: GAS, decimals: 8, amountInput: '5' })));
    expect(res.amountRaw).toBe(500_000_000n);
    expect(res.tokenHash).toBe(GAS);
  });

  it('the same typed amount scales to wildly different base units across tokens', () => {
    const neo = expectOk(parseLockForm(makeForm({ decimals: 0, amountInput: '5' })));
    const gas = expectOk(parseLockForm(makeForm({ decimals: 8, amountInput: '5' })));
    expect(gas.amountRaw).toBe(neo.amountRaw * 100_000_000n);
  });

  it('regression: NEO "5" is NOT mis-scaled by 1e8 (the silent-fail bug)', () => {
    // Hardcoding 8 decimals turned 5 NEO into 500,000,000 NEO, which the
    // on-chain transfer rejected (insufficient balance → returns false).
    const res = expectOk(parseLockForm(makeForm({ decimals: 0, amountInput: '5' })));
    expect(res.amountRaw).not.toBe(500_000_000n);
    expect(res.amountRaw).toBe(5n);
  });

  it('refuses to build a tx until token decimals are known', () => {
    const res = parseLockForm(makeForm({ decimals: undefined }));
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toMatch(/decimals/i);
  });

  it('rejects fractional NEO with a decimals-aware message', () => {
    const res = parseLockForm(makeForm({ decimals: 0, amountInput: '5.5' }));
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toMatch(/0 decimal places/);
  });

  it('stepped schedule scales the amount and emits a tranche blob', () => {
    const res = expectOk(parseLockForm(makeForm({
      scheduleType: 'stepped',
      decimals: 8,
      amountInput: '4',
      stepsInput: '4',
    })));
    expect(res.amountRaw).toBe(400_000_000n);
    expect(typeof res.trancheBlobBase64).toBe('string');
  });
});

describe('normalizeHashOrAddress', () => {
  it('passes 0x scripthashes through (lowercased)', () => {
    expect(normalizeHashOrAddress('0xEF4073A0F2B305A38EC4050E4D3D28BC40EA63F5')).toBe(NEO);
  });

  it('converts a Neo3 address to its 0x scripthash', () => {
    expect(normalizeHashOrAddress('NV1Q1dTdvzPbThPbSFz7zudTmsmgnCwX6c'))
      .toBe('0x88c48eaef7e64b646440da567cd85c9060efbf63');
  });

  it('rejects garbage', () => {
    expect(normalizeHashOrAddress('not-a-hash')).toBeNull();
    expect(normalizeHashOrAddress('0x123')).toBeNull();
  });
});

describe('parseLockForm — on-chain byte limits', () => {
  it('rejects a category that fits in 32 characters but not in 32 UTF-8 bytes', () => {
    const res = parseLockForm(makeForm({ categoryInput: 'é'.repeat(20) }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/32 bytes/);
  });

  it('rejects a note over 256 UTF-8 bytes', () => {
    const res = parseLockForm(makeForm({ noteInput: '✓'.repeat(100) }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/256 bytes/);
  });

  it('accepts a 32-byte ASCII category', () => {
    expect(parseLockForm(makeForm({ categoryInput: 'a'.repeat(32) })).ok).toBe(true);
  });
});

describe('parseLockForm — stepped schedules', () => {
  it('returns the generated tranches alongside the blob', () => {
    const res = expectOk(parseLockForm(makeForm({
      scheduleType: 'stepped', amountInput: '10', stepsInput: '4',
      startInput: '2999-01-01T00:00', endInput: '2999-04-01T00:00',
    })));
    expect(res.tranches).toHaveLength(4);
    expect(res.trancheBlobBase64).toBeTruthy();
    expect(res.tranches!.reduce((s, t) => s + t.amount, 0n)).toBe(10n);
  });

  it('rejects tranche counts the date range cannot keep strictly ascending', () => {
    const res = parseLockForm(makeForm({
      scheduleType: 'stepped', amountInput: '100', stepsInput: '64',
      startInput: '2999-01-01T00:00', endInput: '2999-01-01T00:00:30',
    }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/share a timestamp/);
  });

  it('rejects an amount too small to give every tranche a positive share', () => {
    const res = parseLockForm(makeForm({
      scheduleType: 'stepped', amountInput: '3', stepsInput: '4',
      startInput: '2999-01-01T00:00', endInput: '2999-04-01T00:00',
    }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/too small/);
  });
});
