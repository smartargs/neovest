/**
 * RPC-backed read methods for the VestingVault contract.
 *
 * Every method maps 1:1 to a `@Safe` method on `VestingVault.java`. They are
 * pure RPC calls (no transaction, no signing); for writes see
 * `lib/transactions.ts` (added when wallet wiring lands).
 */

import { rpc, sc, u } from '@cityofzion/neon-js';
import type { StackItemJson } from '@cityofzion/neon-core/lib/sc';
import type { Network } from './rpc';
import { getRpcClient } from './rpc';
import type { Lock, ScheduleType } from './types';
import type { CategoryId } from './data';

const SCHEDULE_TYPES: ScheduleType[] = ['cliff', 'linear', 'stepped'];

// ---------- Stack-item helpers ----------

function asBigInt(item: StackItemJson | undefined): bigint {
  if (!item || item.value == null) return 0n;
  if (item.type === 'Integer') return BigInt(item.value as string);
  if (item.type === 'Boolean') return item.value ? 1n : 0n;
  return 0n;
}

function asNumber(item: StackItemJson | undefined): number {
  return Number(asBigInt(item));
}

function asBoolean(item: StackItemJson | undefined): boolean {
  return asBigInt(item) !== 0n;
}

function asString(item: StackItemJson | undefined): string {
  if (!item || item.value == null) return '';
  // ByteString comes back base64-encoded as the value string.
  if (item.type === 'ByteString') {
    try {
      return atob(item.value as string);
    } catch {
      return '';
    }
  }
  return String(item.value);
}

/** Decode a 20-byte hash from a ByteString (base64) into a 0x-prefixed big-endian hex string. */
function asHash160(item: StackItemJson | undefined): string {
  if (!item || item.value == null) return '';
  // base64 → bytes (little-endian as stored on-chain) → reverse to big-endian
  const bytes = u.base642hex(item.value as string);
  // Reverse every two characters
  const reversed = (bytes.match(/.{2}/g) || []).reverse().join('');
  return '0x' + reversed;
}

function dateFromUnixSec(s: number): Date {
  return new Date(s * 1000);
}

// ---------- Calls ----------

/** Read methods on the vault contract. */
export async function getLockCount(contractHash: string, network?: Network): Promise<number> {
  const client = getRpcClient(network);
  const r = await client.invokeFunction(stripHex(contractHash), 'getLockCount');
  return asNumber(r.stack?.[0]);
}

export async function getLock(contractHash: string, lockId: number, network?: Network): Promise<Lock | null> {
  const client = getRpcClient(network);
  const r = await client.invokeFunction(stripHex(contractHash), 'getLock', [
    sc.ContractParam.integer(lockId),
  ]);
  const top = r.stack?.[0];
  if (!top || top.type === 'Any' || top.value == null) return null;
  // Lock is serialized by the contract as an Array stack item with field order
  // matching Lock.java. Decode field-by-field.
  const fields = top.value as StackItemJson[];
  if (!Array.isArray(fields) || fields.length < 16) return null;
  return decodeLockFields(fields);
}

export async function vestedAmount(contractHash: string, lockId: number, network?: Network): Promise<number> {
  const client = getRpcClient(network);
  const r = await client.invokeFunction(stripHex(contractHash), 'vestedAmount', [
    sc.ContractParam.integer(lockId),
  ]);
  return asNumber(r.stack?.[0]);
}

export async function claimableAmount(contractHash: string, lockId: number, network?: Network): Promise<number> {
  const client = getRpcClient(network);
  const r = await client.invokeFunction(stripHex(contractHash), 'claimableAmount', [
    sc.ContractParam.integer(lockId),
  ]);
  return asNumber(r.stack?.[0]);
}

/** Returns the vault's bound owner — the only address allowed to deposit. */
export async function getOwner(contractHash: string, network?: Network): Promise<string | null> {
  const client = getRpcClient(network);
  try {
    const r = await client.invokeFunction(stripHex(contractHash), 'getOwner');
    const top = r.stack?.[0];
    if (!top || top.type === 'Any' || top.value == null) return null;
    return asHash160(top);
  } catch {
    return null;
  }
}

/**
 * Whether a contract is deployed at this hash on the given network.
 * Returns false on any RPC error so callers can render a single
 * "not found / unreachable" message without inspecting the failure.
 */
export async function contractExists(contractHash: string, network?: Network): Promise<boolean> {
  const client = getRpcClient(network);
  try {
    const state = await client.getContractState(stripHex(contractHash));
    return !!state;
  } catch {
    return false;
  }
}

/**
 * Fetch the deployed contract's state (NEF + manifest) via RPC. Used to
 * verify the deployed bytecode's checksum against the expected one bundled
 * with the UI build.
 */
export async function getContractChecksum(contractHash: string, network?: Network): Promise<number | null> {
  const client = getRpcClient(network);
  try {
    const state = await client.getContractState(stripHex(contractHash));
    // Shape: { hash, nef: { magic, compiler, source, tokens, script, checksum }, manifest, ... }
    const checksum = (state as { nef?: { checksum?: number | string } }).nef?.checksum;
    if (checksum == null) return null;
    return typeof checksum === 'string' ? Number(checksum) : checksum;
  } catch {
    // Contract not found or RPC error — treat as unknown rather than throwing.
    return null;
  }
}

export async function totalLocked(contractHash: string, tokenHash: string, network?: Network): Promise<number> {
  const client = getRpcClient(network);
  const r = await client.invokeFunction(stripHex(contractHash), 'totalLocked', [
    sc.ContractParam.hash160(stripHex(tokenHash)),
  ]);
  return asNumber(r.stack?.[0]);
}

export interface TokenInfo {
  symbol: string;
  decimals: number;
  totalSupply: number;
}

/**
 * Read NEP-17 metadata + totalSupply for a token contract via three test
 * invokes. Returns null if any call faults.
 */
export async function getTokenInfo(tokenHash: string, network?: Network): Promise<TokenInfo | null> {
  const client = getRpcClient(network);
  try {
    const [sym, dec, sup] = await Promise.all([
      client.invokeFunction(stripHex(tokenHash), 'symbol'),
      client.invokeFunction(stripHex(tokenHash), 'decimals'),
      client.invokeFunction(stripHex(tokenHash), 'totalSupply'),
    ]);
    return {
      symbol: asString(sym.stack?.[0]),
      decimals: asNumber(dec.stack?.[0]),
      totalSupply: asNumber(sup.stack?.[0]),
    };
  } catch {
    return null;
  }
}

/** Iterator-typed methods. Traverses the session iterator and returns lockIds. */
async function readLockIdsByIndex(
  contractHash: string,
  method: string,
  subjectHash: string,
  network?: Network,
): Promise<number[]> {
  const client = getRpcClient(network);
  const r = await client.invokeFunction(stripHex(contractHash), method, [
    sc.ContractParam.hash160(stripHex(subjectHash)),
  ]);
  const sessionId = (r as { session?: string }).session;
  const top = r.stack?.[0];
  if (!sessionId || !top || top.type !== 'InteropInterface') return [];
  const iteratorId = (top as { id?: string }).id;
  if (!iteratorId) return [];

  const ids: number[] = [];
  // Page through up to a sensible cap. RPC limits ~100 per call.
  for (let i = 0; i < 10; i++) {
    const traverse = await client.execute(
      rpc.Query.traverseIterator(sessionId, iteratorId, 100),
    );
    if (!Array.isArray(traverse) || traverse.length === 0) break;
    for (const item of traverse) ids.push(asNumber(item as unknown as StackItemJson));
    if (traverse.length < 100) break;
  }
  // Best-effort session cleanup; don't error if the node already reaped it.
  try {
    await fetch(getRpcClient(network).url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'terminatesession', params: [sessionId] }),
    });
  } catch {
    /* ignore */
  }
  return ids;
}

export function getLocksByBeneficiary(contractHash: string, beneficiary: string, network?: Network) {
  return readLockIdsByIndex(contractHash, 'getLocksByBeneficiary', beneficiary, network);
}

export function getLocksByDepositor(contractHash: string, depositor: string, network?: Network) {
  return readLockIdsByIndex(contractHash, 'getLocksByDepositor', depositor, network);
}

export function getLocksByToken(contractHash: string, token: string, network?: Network) {
  return readLockIdsByIndex(contractHash, 'getLocksByToken', token, network);
}

/**
 * Convenience: enumerate every lock in the vault. Reads getLockCount, then
 * fetches each lock 1..count via {@link getLock}. Cheap for vaults with up
 * to a few hundred locks; larger vaults should paginate.
 */
export async function getAllLocks(contractHash: string, network?: Network): Promise<Lock[]> {
  const count = await getLockCount(contractHash, network);
  const locks = await Promise.all(
    Array.from({ length: count }, (_, i) => getLock(contractHash, i + 1, network)),
  );
  return locks.filter((l): l is Lock => l != null);
}

// ---------- Internal: Lock decoding ----------

function decodeLockFields(fields: StackItemJson[]): Lock {
  const lockId        = asNumber(fields[0]);
  const depositor     = asHash160(fields[1]);
  const beneficiary   = asHash160(fields[2]);
  const token         = asHash160(fields[3]);
  const totalAmount   = asNumber(fields[4]);
  const claimedAmount = asNumber(fields[5]);
  const scheduleByte  = asNumber(fields[6]);
  const startTime     = asNumber(fields[7]);
  const endTime       = asNumber(fields[8]);
  const cliffTime     = asNumber(fields[9]);
  // tranches blob (fields[10]) not decoded here — do it on demand for stepped views
  const category      = asString(fields[11]);
  const note          = asString(fields[12]);
  const createdAt     = asNumber(fields[13]);
  const revocable     = asBoolean(fields[14]);
  const revoked       = asBoolean(fields[15]);

  const type = SCHEDULE_TYPES[scheduleByte] ?? 'cliff';

  return {
    id: lockId,
    depositor,
    beneficiary,
    token,
    amount: totalAmount,
    claimed: claimedAmount,
    type,
    start: dateFromUnixSec(startTime),
    end: dateFromUnixSec(endTime),
    cliff: cliffTime > 0 ? dateFromUnixSec(cliffTime) : undefined,
    category: (category as CategoryId) || 'other',
    note,
    createdAt: dateFromUnixSec(createdAt),
    revocable,
    revoked,

    // Backward-compat aliases (some components still read .cat / .ben / .dep / .rev / .label)
    cat: (category as CategoryId) || 'other',
    ben: beneficiary,
    dep: depositor,
    rev: revocable,
    label: note,
  };
}

function stripHex(s: string): string {
  return s.startsWith('0x') ? s.slice(2) : s;
}
