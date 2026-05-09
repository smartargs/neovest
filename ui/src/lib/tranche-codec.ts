/**
 * Encoder for stepped-vesting tranche blobs.
 *
 * The on-chain `Lock.tranches` field is a `ByteString` produced by
 * {@code StdLib.serialize(Object[][])} on the contract side. Each element
 * is a 2-tuple `[timestampSec, amountRaw]` of integers. The contract calls
 * {@code StdLib.deserialize} when validating and computing vested amounts.
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
 *
 * For tranches: count ≤ 64 so the outer/inner array counts always fit in
 * one byte; integer payloads are usually 1–9 bytes (timestamps fit in 5,
 * amount-raw fits in 9 for 64-bit values).
 */

const TYPE_INTEGER = 0x21;
const TYPE_ARRAY = 0x40;

export interface Tranche {
  /** Unix seconds — when this tranche becomes claimable. */
  ts: number;
  /** Amount in the token's smallest units (raw on-chain integer). */
  amount: bigint;
}

/**
 * Serialize tranches to a base64 string suitable for the `ByteArray`
 * dappkit ContractParam value. Mirrors the Neo VM stack-item binary
 * format that {@code StdLib.deserialize} consumes.
 */
export function serializeTranchesToBase64(tranches: Tranche[]): string {
  const out: number[] = [];
  // Outer: Array<Array<Integer>>
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

// ---------- internal: varint + integer encoding ----------

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

/**
 * Write an Integer stack item: type byte, varInt length, signed
 * little-endian bytes. Matches Neo's BigInteger ToByteArray() output.
 */
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
    // two's complement: invert + 1
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

function bytesToBase64(bytes: number[]): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
