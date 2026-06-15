import { describe, it, expect } from 'vitest';
import { fmtTokenAmount, fmtDateTime } from './format';

describe('fmtTokenAmount — scales by the token decimals', () => {
  it('NEO (0 decimals): raw value is the whole-token value', () => {
    expect(fmtTokenAmount(10, 0)).toBe('10');
    expect(fmtTokenAmount(1000n, 0)).toBe('1,000');
  });

  it('GAS (8 decimals): divides by 1e8', () => {
    expect(fmtTokenAmount(500_000_000n, 8)).toBe('5');
    expect(fmtTokenAmount(150_000_000n, 8)).toBe('1.5');
  });

  it('custom token (2 decimals)', () => {
    expect(fmtTokenAmount(125n, 2)).toBe('1.25');
  });

  it('documents the bug: a 0-decimal NEO amount formatted as 8 decimals is wrong', () => {
    // 10 NEO rendered with the old hardcoded 8 decimals → 0.0000001.
    expect(fmtTokenAmount(10, 8)).toBe('0.0000001');
    // With the token's real decimals (0) it correctly reads as 10.
    expect(fmtTokenAmount(10, 0)).toBe('10');
  });

  it('returns "—" when decimals are unknown instead of guessing', () => {
    expect(fmtTokenAmount(10, undefined)).toBe('—');
    expect(fmtTokenAmount(10, null)).toBe('—');
  });

  it('returns "—" for a null amount', () => {
    expect(fmtTokenAmount(null, 8)).toBe('—');
    expect(fmtTokenAmount(undefined, 0)).toBe('—');
  });
});

describe('fmtDateTime — includes seconds', () => {
  it('formats date and time down to the second in UTC', () => {
    const d = new Date(Date.UTC(2026, 5, 15, 14, 30, 5));
    expect(fmtDateTime(d)).toBe('Jun 15, 2026, 14:30:05 UTC');
  });

  it('zero-pads single-digit time components', () => {
    const d = new Date(Date.UTC(2026, 0, 2, 3, 4, 9));
    expect(fmtDateTime(d)).toBe('Jan 2, 2026, 03:04:09 UTC');
  });
});
