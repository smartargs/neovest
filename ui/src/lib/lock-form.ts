import { wallet as neonWallet } from '@cityofzion/neon-js';
import { generateEqualTranches, serializeTranchesToBase64 } from './tranche-codec';
import type { ScheduleType } from './types';

export interface RawLockForm {
  tokenInput: string;
  beneficiaryInput: string;
  amountInput: string;
  startInput: string;
  endInput: string;
  cliffInput: string;
  stepsInput: string;
  categoryInput: string;
  noteInput: string;
  scheduleType: ScheduleType;
  revocable: boolean;
  /** Token decimals from NEP-17 metadata; undefined while loading/invalid. */
  decimals: number | undefined;
}

export type ParsedLockForm =
  | {
      ok: true;
      tokenHash: string;
      beneficiaryHash: string;
      amountRaw: bigint;
      startSec: number;
      endSec: number;
      cliffSec: number | undefined;
      /** Base64-encoded `StdLib.serialize` blob for stepped schedules. */
      trancheBlobBase64?: string;
    }
  | { ok: false; error: string; tokenHash?: undefined; beneficiaryHash?: undefined };

export function parseLockForm(f: RawLockForm): ParsedLockForm {
  if (!f.tokenInput.trim()) return { ok: false, error: 'Token contract hash required.' };
  if (!f.beneficiaryInput.trim()) return { ok: false, error: 'Beneficiary required.' };
  if (!f.amountInput.trim()) return { ok: false, error: 'Amount required.' };
  if (f.categoryInput.length > 32) return { ok: false, error: 'Category must be 32 characters or less.' };
  if (f.noteInput.length > 256) return { ok: false, error: 'Note must be 256 characters or less.' };

  const tokenHash = normalizeHashOrAddress(f.tokenInput);
  if (!tokenHash) return { ok: false, error: 'Token must be a valid 0x… contract hash.' };
  const beneficiaryHash = normalizeHashOrAddress(f.beneficiaryInput);
  if (!beneficiaryHash) return { ok: false, error: 'Beneficiary must be a valid Neo3 address or 0x scripthash.' };

  const decimals = f.decimals;
  if (decimals == null || !Number.isInteger(decimals) || decimals < 0) {
    return { ok: false, error: 'Reading token decimals — enter a valid NEP-17 token contract hash.' };
  }

  const amountRaw = parseAmount(f.amountInput, decimals);
  if (amountRaw === null) {
    return {
      ok: false,
      error: `Amount must be a positive number with at most ${decimals} decimal place${decimals === 1 ? '' : 's'}.`,
    };
  }
  if (amountRaw <= 0n) return { ok: false, error: 'Amount must be > 0.' };

  const startSec = parseLocalDatetime(f.startInput);
  if (!startSec) return { ok: false, error: 'Invalid start date.' };
  const nowSec = Math.floor(Date.now() / 1000);

  if (f.scheduleType === 'cliff') {
    if (startSec <= nowSec + 30) return { ok: false, error: 'Cliff date must be at least ~30s in the future.' };
    return { ok: true, tokenHash, beneficiaryHash, amountRaw, startSec, endSec: startSec, cliffSec: undefined };
  }

  if (f.scheduleType === 'stepped') {
    if (startSec <= nowSec + 30) return { ok: false, error: 'First unlock must be at least ~30s in the future.' };
    const endSecS = parseLocalDatetime(f.endInput);
    if (!endSecS) return { ok: false, error: 'Invalid last-unlock date.' };
    if (endSecS < startSec) return { ok: false, error: 'Last unlock must be ≥ first unlock.' };
    const steps = parseInt(f.stepsInput, 10);
    if (!Number.isFinite(steps) || steps < 1) return { ok: false, error: 'Number of tranches must be ≥ 1.' };
    if (steps > 64) return { ok: false, error: 'Number of tranches must be ≤ 64 (contract limit).' };
    if (steps > 1 && endSecS === startSec) {
      return { ok: false, error: 'Last unlock must be after first when there is more than one tranche.' };
    }
    const tranches = generateEqualTranches(startSec, endSecS, steps, amountRaw);
    const trancheBlobBase64 = serializeTranchesToBase64(tranches);
    return {
      ok: true,
      tokenHash,
      beneficiaryHash,
      amountRaw,
      startSec,
      endSec: endSecS,
      cliffSec: undefined,
      trancheBlobBase64,
    };
  }

  // Linear
  if (startSec <= nowSec + 30) return { ok: false, error: 'Start date must be at least ~30s in the future.' };
  const endSec = parseLocalDatetime(f.endInput);
  if (!endSec) return { ok: false, error: 'Invalid end date.' };
  if (endSec <= startSec) return { ok: false, error: 'End must be after start.' };

  let cliffSec: number | undefined;
  if (f.cliffInput.trim()) {
    const c = parseLocalDatetime(f.cliffInput);
    if (!c) return { ok: false, error: 'Invalid cliff date.' };
    if (c < startSec || c > endSec) return { ok: false, error: 'Cliff must be within [start, end].' };
    cliffSec = c;
  }
  return { ok: true, tokenHash, beneficiaryHash, amountRaw, startSec, endSec, cliffSec };
}

/** Accepts a Neo3 address (N…) or 0x-prefixed hex scripthash. Returns 0x-form. */
export function normalizeHashOrAddress(s: string): string | null {
  const t = s.trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(t)) return t.toLowerCase();
  if (/^N[A-Za-z0-9]{33}$/.test(t)) {
    try {
      return '0x' + neonWallet.getScriptHashFromAddress(t);
    } catch {
      return null;
    }
  }
  return null;
}

/** Parse a decimal amount (e.g. "1.5") into raw token units (bigint). */
export function parseAmount(s: string, decimals: number): bigint | null {
  const t = s.replace(/,/g, '').trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const [whole, frac = ''] = t.split('.');
  if (frac.length > decimals) return null; // too many decimals
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt(fracPadded);
}

/** Convert a `<input type="datetime-local">` value to unix seconds. */
export function parseLocalDatetime(s: string): number | null {
  if (!s) return null;
  const ms = new Date(s).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / 1000);
}
