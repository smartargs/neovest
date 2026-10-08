/**
 * Shared UI types.
 *
 * The on-chain {@code Lock} struct (see {@code contract/.../Lock.java}) maps
 * to {@link Lock} below. Conversions live in {@code lib/contract.ts} (real
 * RPC reads) and {@code lib/demo-data.ts} (canned demo dataset).
 */

import type { CategoryId } from './data';

export type ScheduleType = 'cliff' | 'linear' | 'stepped';

export interface Lock {
  /** Auto-incrementing unique identifier assigned by the contract on creation. */
  id: number;
  /** Hash160 of the depositor (script hash, big-endian hex with `0x` prefix). */
  depositor: string;
  /** Hash160 of the beneficiary. */
  beneficiary: string;
  /** Hash160 of the NEP-17 token contract. */
  token: string;
  /** Total tokens locked, in the token's smallest unit, as a JS number for chart math. */
  amount: number;
  /** Exact total, in the token's smallest unit. Use this for anything displayed. */
  amountRaw: bigint;
  /** Tokens already claimed by the beneficiary, as a JS number for chart math. */
  claimed: number;
  /** Exact claimed amount, in the token's smallest unit. */
  claimedRaw: bigint;
  /** Schedule type. */
  type: ScheduleType;
  /** Vesting start. */
  start: Date;
  /** Vesting end. */
  end: Date;
  /** Optional cliff (linear schedules only). */
  cliff?: Date;
  /** Tranche schedule decoded from the on-chain blob (stepped schedules only). */
  tranches?: { ts: Date; amount: number }[];
  /** Free-form display category — `team`, `investor`, etc. */
  category: CategoryId | string;
  /** Optional public note. */
  note: string;
  /** Block timestamp at creation. */
  createdAt: Date;
  /** True if the depositor can revoke unvested portion. */
  revocable: boolean;
  /** True after a successful revoke (schedule frozen). */
  revoked: boolean;
  /** Block timestamp of revocation; undefined if not revoked. */
  revokedAt?: Date;

  // ---- Display aliases — always populated by adapters; kept for backward
  //      compat with components that already use the short names.

  /** Alias for {@link category}. */
  cat: CategoryId | string;
  /** Alias for {@link beneficiary}. */
  ben: string;
  /** Alias for {@link depositor}. */
  dep: string;
  /** Alias for {@link note}. */
  label: string;
  /** Alias for {@link revocable}. */
  rev: boolean;
}
