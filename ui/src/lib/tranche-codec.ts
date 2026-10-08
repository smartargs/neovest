/**
 * Codec for stepped-vesting tranche blobs.
 *
 * The on-chain `Lock.tranches` field is a `ByteString` produced by
 * {@code StdLib.serialize(Object[][])} on the contract side. Each element
 * is a 2-tuple `[timestampSec, amountRaw]` of integers. The contract calls
 * {@code StdLib.deserialize} when validating and computing vested amounts;
 * the UI decodes the same bytes to mirror that math.
 *
 * Neo's binary stack-item format (see neo-modules
 * `BinarySerializer.Serialize`):
 *
 *   ┌──────────────┬────────────────────────────────────────────┐
 *   │ 0x21         │ Integer    payload = varBytes(LE signed)    │
 *   │ 0x40         │ Array      payload = varInt(count) + items  │
 *   └──────────────┴────────────────────────────────────────────┘
 *
 * `varBytes` is `varInt(len) + bytes`. `varInt` follows Neo's standard
 * little-endian variable-length scheme (single byte for n < 0xfd, etc).
 */

const TYPE_ANY = 0x00;
const TYPE_BOOLEAN = 0x20;
const TYPE_INTEGER = 0x21;
const TYPE_BYTESTRING = 0x28;
const TYPE_BUFFER = 0x30;
const TYPE_ARRAY = 0x40;
const TYPE_STRUCT = 0x41;

export interface Tranche {
  /** Unix seconds — when this tranche becomes claimable. */
  ts: number;
  /** Amount in the token's smallest units (raw on-chain integer). */
  amount: bigint;
}

export function serializeTranchesToBase64(tranches: Tranche[]): string {
  const out: number[] = [];
  out.push(TYPE_ARRAY);
  writeVarInt(out, tranches.length);
  for (const t of tranches) {
    out.push(TYPE_ARRAY);
    writeVarInt(out, 2);
    writeInteger(out, BigInt(t.ts));
    writeInteger(out, t.amount);
  }
  return bytesToBase64(out);
}

export function deserializeTranchesFromBase64(b64: string): Tranche[] {
  const bytes = base64ToBytes(b64);
  const reader = { pos: 0 };
  const outer = readItem(bytes, reader);
  if (!Array.isArray(outer)) throw new Error('tranches: expected an array');
  return outer.map((pair) => {
    if (!Array.isArray(pair) || pair.length < 2) throw new Error('tranches: expected [ts, amount] pairs');
    const [ts, amount] = pair;
    if (typeof ts !== 'bigint' || typeof amount !== 'bigint') throw new Error('tranches: expected integer pairs');
    return { ts: Number(ts), amount };
  });
}

/**
 * Generate equally-spaced, equally-sized tranches from a start / end pair
 * and a step count. Amounts sum exactly to `totalAmount` (any rounding
 * remainder is folded into the last tranche).
 *
 * For `steps === 1`, the result is a single tranche at `endSec`.
 */
export function generateEqualTranches(
  startSec: number,
  endSec: number,
  steps: number,
  totalAmount: bigint,
): Tranche[] {
  if (steps < 1) throw new Error('steps must be >= 1');
  if (steps === 1) return [{ ts: endSec, amount: totalAmount }];
  if (endSec <= startSec) throw new Error('end must be after start');
  const base = totalAmount / BigInt(steps);
  const remainder = totalAmount - base * BigInt(steps);
  const tranches: Tranche[] = [];
  for (let i = 0; i < steps; i++) {
    const ts =
      i === 0 ? startSec :
      i === steps - 1 ? endSec :
      Math.round(startSec + ((endSec - startSec) * i) / (steps - 1));
    const amount = i === steps - 1 ? base + remainder : base;
    tranches.push({ ts, amount });
  }
  return tranches;
}

type StackValue = bigint | null | StackValue[];

function readItem(bytes: Uint8Array, r: { pos: number }): StackValue {
  if (r.pos >= bytes.length) throw new Error('tranches: truncated');
  const type = bytes[r.pos++];
  switch (type) {
    case TYPE_ANY:
      return null;
    case TYPE_BOOLEAN:
      return BigInt(readByte(bytes, r));
    case TYPE_INTEGER:
    case TYPE_BYTESTRING:
    case TYPE_BUFFER: {
      const len = readVarInt(bytes, r);
      if (r.pos + len > bytes.length) throw new Error('tranches: truncated');
      const value = signedLEToBigint(bytes.subarray(r.pos, r.pos + len));
      r.pos += len;
      return value;
    }
    case TYPE_ARRAY:
    case TYPE_STRUCT: {
      const count = readVarInt(bytes, r);
      const items: StackValue[] = [];
      for (let i = 0; i < count; i++) items.push(readItem(bytes, r));
      return items;
    }
    default:
      throw new Error(`tranches: unsupported stack item type 0x${type.toString(16)}`);
  }
}

function readByte(bytes: Uint8Array, r: { pos: number }): number {
  if (r.pos >= bytes.length) throw new Error('tranches: truncated');
  return bytes[r.pos++];
}

function readVarInt(bytes: Uint8Array, r: { pos: number }): number {
  const first = readByte(bytes, r);
  if (first < 0xfd) return first;
  if (first === 0xfd) {
    return readByte(bytes, r) | (readByte(bytes, r) << 8);
  }
  if (first === 0xfe) {
    const low = readByte(bytes, r) | (readByte(bytes, r) << 8) | (readByte(bytes, r) << 16);
    return low + readByte(bytes, r) * 0x1000000;
  }
  throw new Error('tranches: varint too large');
}

function writeVarInt(out: number[], n: number): void {
  if (n < 0) throw new Error('varint must be non-negative');
  if (n < 0xfd) {
    out.push(n);
  } else if (n <= 0xffff) {
    out.push(0xfd, n & 0xff, (n >> 8) & 0xff);
  } else if (n <= 0xffffffff) {
    out.push(0xfe);
    for (let i = 0; i < 4; i++) out.push((n >>> (i * 8)) & 0xff);
  } else {
    throw new Error('varint > 2^32 not supported');
  }
}

function writeInteger(out: number[], value: bigint): void {
  out.push(TYPE_INTEGER);
  const bytes = bigintToSignedLE(value);
  writeVarInt(out, bytes.length);
  for (const b of bytes) out.push(b);
}

/**
 * Two's-complement little-endian byte representation matching .NET's
 * `BigInteger.ToByteArray()`:
 *   - Zero serializes as an empty byte array.
 *   - Positive values are LE bytes with a 0x00 padding byte appended if
 *     the most-significant byte's high bit is set (preserves sign).
 *   - Negative values are two's complement with 0xff padding if the MSB
 *     high bit is clear after complementing.
 */
function bigintToSignedLE(value: bigint): number[] {
  if (value === 0n) return [];
  const negative = value < 0n;
  let abs = negative ? -value : value;
  const bytes: number[] = [];
  while (abs > 0n) {
    bytes.push(Number(abs & 0xffn));
    abs >>= 8n;
  }
  if (negative) {
    let carry = 1;
    for (let i = 0; i < bytes.length; i++) {
      const v = (bytes[i] ^ 0xff) + carry;
      bytes[i] = v & 0xff;
      carry = v >> 8;
    }
    if ((bytes[bytes.length - 1] & 0x80) === 0) bytes.push(0xff);
  } else {
    if ((bytes[bytes.length - 1] & 0x80) !== 0) bytes.push(0x00);
  }
  return bytes;
}

function signedLEToBigint(bytes: Uint8Array): bigint {
  if (bytes.length === 0) return 0n;
  let v = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i]);
  if (bytes[bytes.length - 1] & 0x80) v -= 1n << BigInt(8 * bytes.length);
  return v;
}

function bytesToBase64(bytes: number[]): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
