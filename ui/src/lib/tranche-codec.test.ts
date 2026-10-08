import { describe, it, expect } from 'vitest';
import {
  deserializeTranchesFromBase64,
  generateEqualTranches,
  serializeTranchesToBase64,
  type Tranche,
} from './tranche-codec';

describe('tranche codec', () => {
  const vectors: Tranche[][] = [
    [{ ts: 1_700_000_000, amount: 1n }],
    [
      { ts: 1_700_000_000, amount: 100_000_000n },
      { ts: 1_700_000_128, amount: 128n },
      { ts: 1_700_000_255, amount: 255n },
      { ts: 2_147_483_648, amount: 9_223_372_036_854_775_808n },
    ],
    generateEqualTranches(1_800_000_000, 1_900_000_000, 64, 123_456_789_012_345_678_901n),
  ];

  it.each(vectors.map((v, i) => [i, v]))('round-trips vector %i', (_i, v) => {
    const b64 = serializeTranchesToBase64(v as Tranche[]);
    expect(deserializeTranchesFromBase64(b64)).toEqual(v);
  });

  it('matches the Neo stack-item layout byte for byte', () => {
    const b64 = serializeTranchesToBase64([{ ts: 0x80, amount: 0n }]);
    const bytes = Array.from(Buffer.from(b64, 'base64'));
    expect(bytes).toEqual([0x40, 1, 0x40, 2, 0x21, 2, 0x80, 0x00, 0x21, 0]);
  });

  it('accepts integers encoded as ByteString items', () => {
    const bytes = [0x40, 1, 0x40, 2, 0x28, 1, 0x05, 0x28, 1, 0x07];
    const b64 = Buffer.from(bytes).toString('base64');
    expect(deserializeTranchesFromBase64(b64)).toEqual([{ ts: 5, amount: 7n }]);
  });

  it('rejects truncated and malformed blobs', () => {
    expect(() => deserializeTranchesFromBase64(Buffer.from([0x40, 2, 0x40, 2]).toString('base64'))).toThrow();
    expect(() => deserializeTranchesFromBase64(Buffer.from([0x21, 1, 0x01]).toString('base64'))).toThrow();
    expect(() => deserializeTranchesFromBase64(Buffer.from([0x40, 1, 0x40, 1, 0x21, 0]).toString('base64'))).toThrow();
  });
});
