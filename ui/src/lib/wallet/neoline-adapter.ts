/**
 * NeoLine direct adapter — exposes the browser extension's dAPI in the same
 * shape the rest of the app uses for the AppKit/WalletConnect path.
 *
 * The extension is asynchronous: it injects `window.NEOLineN3` after
 * `DOMContentLoaded` and fires a `NEOLine.N3.EVENT.READY` event. We wait for
 * either signal with a short timeout so a missing extension fails fast.
 *
 * NeoLine doesn't expose `traverseIterator` or `calculateFee`. Read-side
 * code in this app uses {@link getRpcClient} directly (no wallet involved),
 * so the adapter doesn't need to implement those.
 */

import type { ContractInvocationMulti, Arg, Signer } from '@cityofzion/neon-dappkit-types';
import { wallet as neonWallet } from '@cityofzion/neon-js';
import type { NeoLineN3, NeoLineArg, NeoLineSigner } from './neoline-types';

const SCOPE_CODES: Record<string, number> = {
  None: 0,
  CalledByEntry: 1,
  CustomContracts: 16,
  CustomGroups: 32,
  WitnessRules: 64,
  Global: 128,
};

function toScriptHash(addrOrHash: string): string {
  const t = addrOrHash.trim();
  if (t.startsWith('0x') && t.length === 42) return t.toLowerCase();
  return '0x' + neonWallet.getScriptHashFromAddress(t);
}

function toNeoLineScope(scopes: number | string | undefined): number {
  if (typeof scopes === 'number') return scopes;
  if (!scopes) return SCOPE_CODES.CalledByEntry;
  return scopes.split(',').reduce((acc, part) => {
    const code = SCOPE_CODES[part.trim()];
    if (code == null) throw new Error(`Unknown witness scope: ${part}`);
    return acc | code;
  }, 0);
}

function toNeoLineSigner(signer: Signer, fallbackAccount: string): NeoLineSigner {
  const out: NeoLineSigner = {
    account: toScriptHash(signer.account ?? fallbackAccount),
    scopes: toNeoLineScope(signer.scopes),
  };
  if (signer.allowedContracts) out.allowedContracts = signer.allowedContracts.map(toScriptHash);
  if (signer.allowedGroups) out.allowedGroups = signer.allowedGroups;
  return out;
}

function getNeoLine(timeoutMs = 3000): Promise<NeoLineN3> {
  if (typeof window === 'undefined') return Promise.reject(new Error('NeoLine: no window'));

  if (window.NEOLineN3) return Promise.resolve(new window.NEOLineN3.Init());

  return new Promise<NeoLineN3>((resolve, reject) => {
    const onReady = () => {
      window.removeEventListener('NEOLine.N3.EVENT.READY', onReady);
      if (!window.NEOLineN3) return reject(new Error('NeoLine extension not detected.'));
      resolve(new window.NEOLineN3.Init());
    };
    window.addEventListener('NEOLine.N3.EVENT.READY', onReady);
    setTimeout(() => {
      window.removeEventListener('NEOLine.N3.EVENT.READY', onReady);
      if (window.NEOLineN3) {
        resolve(new window.NEOLineN3.Init());
      } else {
        reject(new Error('NeoLine not installed. Get it at https://neoline.io.'));
      }
    }, timeoutMs);
  });
}

function argToNeoLine(a: Arg): NeoLineArg {
  return a as unknown as NeoLineArg;
}

export interface NeoLineProviderShape {
  readonly address: string;
  readonly publicKey: string;
  readonly network: string;
  invokeFunction(req: ContractInvocationMulti): Promise<string>;
  signMessage(req: { message: string }): Promise<{ publicKey: string; data: string; salt: string; message: string }>;
}

export async function buildNeoLineProvider(): Promise<NeoLineProviderShape> {
  const cli = await getNeoLine();
  const acct = await cli.getAccount();
  const nets = await cli.getNetworks();

  return {
    address: acct.address,
    publicKey: acct.publicKey,
    network: nets.defaultNetwork,

    async invokeFunction(req: ContractInvocationMulti): Promise<string> {
      const signers = (req.signers ?? []).map((s) => toNeoLineSigner(s, acct.address));

      if (req.invocations.length === 1) {
        const inv = req.invocations[0];
        const r = await cli.invoke({
          scriptHash: inv.scriptHash,
          operation: inv.operation,
          args: (inv.args ?? []).map(argToNeoLine),
          signers,
        });
        return r.txid;
      }

      const r = await cli.invokeMultiple({
        invokeArgs: req.invocations.map((inv) => ({
          scriptHash: inv.scriptHash,
          operation: inv.operation,
          args: (inv.args ?? []).map(argToNeoLine),
        })),
        signers,
      });
      return r.txid;
    },

    async signMessage(req) {
      const fn = cli.signMessageV2 ?? cli.signMessage;
      return fn.call(cli, req);
    },
  };
}

export function isNeoLineAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.NEOLineN3;
}
