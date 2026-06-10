import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StackItemJson } from '@cityofzion/neon-core/lib/sc';

// Mock the RPC layer so these tests are pure: hand-crafted stack-item
// payloads, no network. We're asserting our own decoding here — not
// neon-js's transport. `vi.hoisted` is required because `vi.mock` is
// hoisted above the module body.
const { invokeFunction, getContractState } = vi.hoisted(() => ({
  invokeFunction: vi.fn(),
  getContractState: vi.fn(),
}));
vi.mock('./rpc', () => ({
  defaultNetwork: () => 'mainnet',
  getRpcClient: () => ({ invokeFunction, getContractState }),
}));

import { u } from '@cityofzion/neon-js';
import {
  claimableAmount,
  contractExists,
  getContractChecksum,
  getDeployedNefInfo,
  getLock,
  getLockCount,
  getOwner,
  getTokenInfo,
  vestedAmount,
} from './contract';

// ---------- fixtures ----------

const HASH = '0x1111111111111111111111111111111111111111';

const integer = (n: number | string): StackItemJson => ({ type: 'Integer', value: String(n) });
const boolean = (b: boolean): StackItemJson => ({ type: 'Boolean', value: b });
const any = (): StackItemJson => ({ type: 'Any', value: null });
/** A 20-byte hash, big-endian display form, plus its on-chain little-endian base64. */
function hash160(displayHex0x: string): { display: string; item: StackItemJson } {
  const hex = displayHex0x.slice(2);
  const le = Buffer.from(hex.match(/.{2}/g)!.reverse().join(''), 'hex').toString('base64');
  return { display: displayHex0x, item: { type: 'ByteString', value: le } };
}
/** A UTF-8 string as a ByteString stack item (the contract returns base64). */
const str = (s: string): StackItemJson => ({ type: 'ByteString', value: Buffer.from(s, 'utf8').toString('base64') });

const DEPOSITOR = hash160('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
const BENEFICIARY = hash160('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
const TOKEN = hash160('0xcccccccccccccccccccccccccccccccccccccccc');

/** Build the 16-field Array stack item the contract serializes a Lock as. */
function lockArray(overrides: Partial<{
  id: number; total: number; claimed: number; schedule: number;
  start: number; end: number; cliff: number; created: number;
  category: string; note: string; revocable: boolean; revoked: boolean;
}> = {}): StackItemJson {
  const o = {
    id: 7, total: 1_000_000, claimed: 250_000, schedule: 1,
    start: 1_700_000_000, end: 1_730_000_000, cliff: 1_705_000_000, created: 1_699_000_000,
    category: 'team', note: 'Q3 grant', revocable: true, revoked: false, ...overrides,
  };
  return {
    type: 'Array',
    value: [
      integer(o.id),            // 0  lockId
      DEPOSITOR.item,           // 1  depositor
      BENEFICIARY.item,         // 2  beneficiary
      TOKEN.item,               // 3  token
      integer(o.total),         // 4  totalAmount
      integer(o.claimed),       // 5  claimedAmount
      integer(o.schedule),      // 6  scheduleByte (0=cliff,1=linear,2=stepped)
      integer(o.start),         // 7  startTime
      integer(o.end),           // 8  endTime
      integer(o.cliff),         // 9  cliffTime
      any(),                    // 10 tranches blob — not decoded here
      str(o.category),          // 11 category
      str(o.note),              // 12 note
      integer(o.created),       // 13 createdAt
      boolean(o.revocable),     // 14 revocable
      boolean(o.revoked),       // 15 revoked
    ],
  };
}

beforeEach(() => {
  invokeFunction.mockReset();
  getContractState.mockReset();
});

// ---------- tests ----------

describe('scalar reads', () => {
  it('getLockCount decodes an Integer', async () => {
    invokeFunction.mockResolvedValue({ stack: [integer(12)] });
    expect(await getLockCount(HASH)).toBe(12);
    expect(invokeFunction).toHaveBeenCalledWith('1111111111111111111111111111111111111111', 'getLockCount');
  });

  it('vestedAmount / claimableAmount pass the lockId and decode an Integer', async () => {
    invokeFunction.mockResolvedValue({ stack: [integer(333)] });
    expect(await vestedAmount(HASH, 4)).toBe(333);
    expect(await claimableAmount(HASH, 4)).toBe(333);
    // second positional arg is the [ContractParam] array
    expect(invokeFunction.mock.calls[0][2]).toHaveLength(1);
  });

  it('getLockCount treats an empty stack as 0', async () => {
    invokeFunction.mockResolvedValue({ stack: [] });
    expect(await getLockCount(HASH)).toBe(0);
  });
});

describe('getOwner', () => {
  it('decodes the bound owner as a 0x scripthash (little-endian → big-endian)', async () => {
    invokeFunction.mockResolvedValue({ stack: [DEPOSITOR.item] });
    expect(await getOwner(HASH)).toBe(DEPOSITOR.display);
  });

  it('returns null when the contract returns Any/null', async () => {
    invokeFunction.mockResolvedValue({ stack: [any()] });
    expect(await getOwner(HASH)).toBeNull();
  });

  it('returns null on an RPC error', async () => {
    invokeFunction.mockRejectedValue(new Error('boom'));
    expect(await getOwner(HASH)).toBeNull();
  });
});

describe('getLock — Array stack-item decoding', () => {
  it('decodes every field, mapping schedule byte → type and unix sec → Date', async () => {
    invokeFunction.mockResolvedValue({ stack: [lockArray()] });
    const lock = await getLock(HASH, 7);
    expect(lock).not.toBeNull();
    expect(lock).toMatchObject({
      id: 7,
      depositor: DEPOSITOR.display,
      beneficiary: BENEFICIARY.display,
      token: TOKEN.display,
      amount: 1_000_000,
      claimed: 250_000,
      type: 'linear',
      category: 'team',
      note: 'Q3 grant',
      revocable: true,
      revoked: false,
      // backward-compat aliases some components still read
      ben: BENEFICIARY.display,
      dep: DEPOSITOR.display,
      cat: 'team',
      rev: true,
      label: 'Q3 grant',
    });
    expect(lock!.start.getTime()).toBe(1_700_000_000 * 1000);
    expect(lock!.end.getTime()).toBe(1_730_000_000 * 1000);
    expect(lock!.cliff?.getTime()).toBe(1_705_000_000 * 1000);
    expect(lock!.createdAt.getTime()).toBe(1_699_000_000 * 1000);
  });

  it('maps schedule byte 0 → cliff, 2 → stepped, and omits cliff when cliffTime is 0', async () => {
    invokeFunction.mockResolvedValue({ stack: [lockArray({ schedule: 0, cliff: 0 })] });
    const cliff = await getLock(HASH, 1);
    expect(cliff!.type).toBe('cliff');
    expect(cliff!.cliff).toBeUndefined();

    invokeFunction.mockResolvedValue({ stack: [lockArray({ schedule: 2 })] });
    expect((await getLock(HASH, 2))!.type).toBe('stepped');
  });

  it('falls back to category "other" when the contract stored an empty string', async () => {
    invokeFunction.mockResolvedValue({ stack: [lockArray({ category: '' })] });
    expect((await getLock(HASH, 1))!.category).toBe('other');
  });

  it('returns null for a non-existent lock (Any) or a malformed/short array', async () => {
    invokeFunction.mockResolvedValue({ stack: [any()] });
    expect(await getLock(HASH, 99)).toBeNull();

    invokeFunction.mockResolvedValue({ stack: [{ type: 'Array', value: [integer(1), integer(2)] }] });
    expect(await getLock(HASH, 1)).toBeNull();
  });
});

describe('contractExists / getContractChecksum', () => {
  it('contractExists: true when state resolves, false when null, false when it throws', async () => {
    getContractState.mockResolvedValue({ id: 1, hash: HASH, manifest: { name: 'VestingVault' } });
    expect(await contractExists(HASH)).toBe(true);

    getContractState.mockResolvedValue(null);
    expect(await contractExists(HASH)).toBe(false);

    getContractState.mockRejectedValue(new Error('Unknown contract'));
    expect(await contractExists(HASH)).toBe(false);
  });

  it('getContractChecksum: pulls nef.checksum (coercing strings), null if absent or on error', async () => {
    getContractState.mockResolvedValue({ nef: { checksum: 123456789 } });
    expect(await getContractChecksum(HASH)).toBe(123456789);

    getContractState.mockResolvedValue({ nef: { checksum: '987654321' } });
    expect(await getContractChecksum(HASH)).toBe(987654321);

    getContractState.mockResolvedValue({ nef: {} });
    expect(await getContractChecksum(HASH)).toBeNull();

    getContractState.mockRejectedValue(new Error('not found'));
    expect(await getContractChecksum(HASH)).toBeNull();
  });
});

describe('getDeployedNefInfo', () => {
  // A tiny "script" of bytes 0x01 0x02 0x03; the RPC returns it base64-encoded.
  const SCRIPT_BYTES_HEX = '010203';
  const SCRIPT_B64 = Buffer.from(SCRIPT_BYTES_HEX, 'hex').toString('base64'); // "AQID"
  const SCRIPT_SHA256 = u.sha256(SCRIPT_BYTES_HEX);

  it('decodes the base64 script and returns its SHA-256 plus the checksum', async () => {
    getContractState.mockResolvedValue({ nef: { checksum: 3551126892, script: SCRIPT_B64 } });
    const info = await getDeployedNefInfo(HASH);
    expect(info).toEqual({ checksum: 3551126892, scriptSha256: SCRIPT_SHA256 });
  });

  it('coerces a string checksum and still hashes the script', async () => {
    getContractState.mockResolvedValue({ nef: { checksum: '42', script: SCRIPT_B64 } });
    expect(await getDeployedNefInfo(HASH)).toEqual({ checksum: 42, scriptSha256: SCRIPT_SHA256 });
  });

  it('leaves scriptSha256 null when the node omits the script', async () => {
    getContractState.mockResolvedValue({ nef: { checksum: 7 } });
    expect(await getDeployedNefInfo(HASH)).toEqual({ checksum: 7, scriptSha256: null });
  });

  it('treats an empty script string as no script', async () => {
    getContractState.mockResolvedValue({ nef: { checksum: 7, script: '' } });
    expect(await getDeployedNefInfo(HASH)).toEqual({ checksum: 7, scriptSha256: null });
  });

  it('returns null when there is no nef, or on RPC error', async () => {
    getContractState.mockResolvedValue({ manifest: { name: 'X' } });
    expect(await getDeployedNefInfo(HASH)).toBeNull();

    getContractState.mockRejectedValue(new Error('not found'));
    expect(await getDeployedNefInfo(HASH)).toBeNull();
  });
});

describe('getTokenInfo', () => {
  it('reads symbol/decimals/totalSupply across three test invokes', async () => {
    invokeFunction
      .mockResolvedValueOnce({ stack: [str('NEOV')] })   // symbol
      .mockResolvedValueOnce({ stack: [integer(8)] })    // decimals
      .mockResolvedValueOnce({ stack: [integer(21_000_000)] }); // totalSupply
    expect(await getTokenInfo(TOKEN.display)).toEqual({ symbol: 'NEOV', decimals: 8, totalSupply: 21_000_000 });
  });

  it('returns null if any of the three calls faults', async () => {
    invokeFunction
      .mockResolvedValueOnce({ stack: [str('NEOV')] })
      .mockRejectedValueOnce(new Error('decimals faulted'));
    expect(await getTokenInfo(TOKEN.display)).toBeNull();
  });
});
