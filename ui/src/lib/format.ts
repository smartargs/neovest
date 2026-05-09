/** Number/date formatting helpers shared across the dashboard. */

export interface FmtNumOpts {
  compact?: boolean;
  decimals?: number;
}

export function fmtNum(n: number | null | undefined, opts: FmtNumOpts = {}): string {
  const { compact = false, decimals = 0 } = opts;
  if (n == null) return '—';
  if (compact) {
    if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(n % 1e9 === 0 ? 0 : 2).replace(/\.?0+$/, '') + 'B';
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1).replace(/\.?0+$/, '') + 'M';
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(0) + 'K';
    return String(n);
  }
  return n.toLocaleString('en-US', { maximumFractionDigits: decimals });
}

/**
 * Format a raw on-chain token amount (smallest units) as a whole-token
 * decimal string. e.g. {@code fmtTokenAmount(111100000000, 8)} → `"1,111"`.
 *
 * Trailing zeros in the fractional part are trimmed. Pass {@code compact}
 * for K/M/B abbreviations on the whole part.
 *
 * @param tokenDecimals defaults to 8 (GAS / NEP-17 convention).
 */
export function fmtTokenAmount(
  raw: number | bigint | null | undefined,
  tokenDecimals = 8,
  opts: FmtNumOpts = {},
): string {
  if (raw == null) return '—';
  const r = typeof raw === 'bigint' ? raw : BigInt(Math.trunc(raw));
  const factor = 10n ** BigInt(tokenDecimals);
  const whole = r / factor;
  const frac = r % factor;
  const wholeNum = Number(whole);
  if (opts.compact) {
    return fmtNum(wholeNum + Number(frac) / Number(factor), { compact: true });
  }
  if (frac === 0n) return wholeNum.toLocaleString('en-US');
  const fracStr = frac.toString().padStart(tokenDecimals, '0').replace(/0+$/, '');
  return wholeNum.toLocaleString('en-US') + '.' + fracStr;
}

export interface FmtDateOpts {
  withYear?: boolean;
  short?: boolean;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(d: Date | string | number, opts: FmtDateOpts = {}): string {
  const date = d instanceof Date ? d : new Date(d);
  const { withYear = true, short = false } = opts;
  const m = MONTHS[date.getUTCMonth()];
  const day = date.getUTCDate();
  const yr = date.getUTCFullYear();
  if (short) return `${m} ${day}`;
  return withYear ? `${m} ${day}, ${yr}` : `${m} ${day}`;
}

export function fmtRelative(target: Date, now: Date): string {
  const ms = target.getTime() - now.getTime();
  const days = Math.round(ms / (24 * 3600 * 1000));
  if (days < 0) return `${Math.abs(days)}d ago`;
  if (days === 0) return 'today';
  if (days < 60) return `+${days}d`;
  const months = Math.round(days / 30);
  if (months < 18) return `+${months}mo`;
  return `+${(days / 365).toFixed(1)}y`;
}

export function shortAddr(a: string): string {
  if (!a) return '';
  if (a.includes('...')) return a;
  return a.slice(0, 6) + '...' + a.slice(-4);
}
