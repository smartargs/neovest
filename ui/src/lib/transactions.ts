/**
 * Wallet-signed write helpers. Each function takes a {@code UnifiedProvider}
 * (from {@code useConnection().provider}, which is either NeoLine direct
 * or AppKit/WalletConnect) and returns the tx hash; the caller awaits
 * confirmation via {@link waitForTx}.
 *
 * Args use the type-tagged form: every value is
 * {@code { type: 'Hash160' | 'Integer' | 'String' | 'Boolean' | 'Array' | 'Any', value: ... }}.
 */

import type { ContractInvocationMulti, Arg } from '@cityofzion/neon-dappkit-types';
import { NeonEventListener } from '@cityofzion/neon-dappkit';
import type { UnifiedProvider } from './connection';
import type { ScheduleType } from './types';

export interface CreateLockArgs {
  tokenHash: string;
  vaultHash: string;
  fromAddress: string;
  beneficiaryHash: string;
  amount: bigint;
  scheduleType: ScheduleType;
  startTime: number;     // unix seconds
  endTime: number;
  cliffTime?: number;    // unix seconds; 0 = no cliff
  trancheBlobHex?: string; // hex-encoded ByteString for stepped, empty for others
  category: string;
  note: string;
  revocable: boolean;
}

const SCHED_CODE: Record<ScheduleType, number> = { cliff: 0, linear: 1, stepped: 2 };

/**
 * createLock = NEP-17 transfer to the vault with the lock parameters encoded
 * in the {@code data} payload. Single transaction.
 */
export async function createLock(provider: UnifiedProvider, a: CreateLockArgs): Promise<string> {
  const dataArr: Arg[] = [
    { type: 'Hash160', value: a.beneficiaryHash },
    { type: 'Integer', value: SCHED_CODE[a.scheduleType].toString() },
    { type: 'Integer', value: a.startTime.toString() },
    { type: 'Integer', value: a.endTime.toString() },
    { type: 'Integer', value: (a.cliffTime ?? 0).toString() },
    { type: 'ByteArray', value: a.trancheBlobHex ?? '' },
    { type: 'String', value: a.category },
    { type: 'String', value: a.note },
    { type: 'Boolean', value: a.revocable },
  ];

  const payload: ContractInvocationMulti = {
    invocations: [
      {
        scriptHash: a.tokenHash,
        operation: 'transfer',
        args: [
          { type: 'Hash160', value: a.fromAddress },
          { type: 'Hash160', value: a.vaultHash },
          { type: 'Integer', value: a.amount.toString() },
          { type: 'Array', value: dataArr },
        ],
      },
    ],
    signers: [{ account: a.fromAddress, scopes: 'CalledByEntry' }],
  };

  const result = await provider.invokeFunction(payload);
  return resolveTxHash(result);
}

export async function claim(provider: UnifiedProvider, vaultHash: string, fromAddress: string, lockId: number): Promise<string> {
  const result = await provider.invokeFunction({
    invocations: [
      {
        scriptHash: vaultHash,
        operation: 'claim',
        args: [{ type: 'Integer', value: lockId.toString() }],
      },
    ],
    signers: [{ account: fromAddress, scopes: 'CalledByEntry' }],
  });
  return resolveTxHash(result);
}

export async function revoke(provider: UnifiedProvider, vaultHash: string, fromAddress: string, lockId: number): Promise<string> {
  const result = await provider.invokeFunction({
    invocations: [
      {
        scriptHash: vaultHash,
        operation: 'revoke',
        args: [{ type: 'Integer', value: lockId.toString() }],
      },
    ],
    signers: [{ account: fromAddress, scopes: 'CalledByEntry' }],
  });
  return resolveTxHash(result);
}

/**
 * Wait for a transaction to be included and assert it didn't FAULT. Returns
 * the application log on success; throws with the VM exception on failure.
 */
export async function waitForTx(txHash: string, network: 'mainnet' | 'testnet' = 'mainnet') {
  const listener = new NeonEventListener(
    network === 'mainnet' ? NeonEventListener.MAINNET : NeonEventListener.TESTNET,
  );
  const log = await listener.waitForApplicationLog(txHash);
  // Throws on FAULT; safe to call even on HALT (no-op).
  listener.confirmTransaction(log);
  return log;
}

/** Some adapters return a string txid, others { hash } — normalize. */
function resolveTxHash(result: unknown): string {
  if (typeof result === 'string') return result;
  if (result && typeof result === 'object' && 'hash' in result) {
    return String((result as { hash: string }).hash);
  }
  throw new Error('Unexpected tx response shape: ' + JSON.stringify(result));
}
