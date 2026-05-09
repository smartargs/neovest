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

import type { ContractInvocationMulti, Arg } from '@cityofzion/neon-dappkit-types';
import type { NeoLineN3, NeoLineArg, NeoLineSigner } from './neoline-types';

/** Resolve the dAPI client. Polls because the extension injects asynchronously. */
async function getNeoLine(timeoutMs = 3000): Promise<NeoLineN3> {
  if (typeof window === 'undefined') throw new Error('NeoLine: no window');

  // Fast path: already injected.
  if (window.NEOLineN3) return window.NEOLineN3.Init();

  // Slow path: wait for the READY event with a timeout fallback.
  return new Promise<NeoLineN3>((resolve, reject) => {
    const onReady = () => {
      window.removeEventListener('NEOLine.N3.EVENT.READY', onReady);
      if (!window.NEOLineN3) return reject(new Error('NeoLine extension not detected.'));
      window.NEOLineN3.Init().then(resolve, reject);
    };
    window.addEventListener('NEOLine.N3.EVENT.READY', onReady);
    setTimeout(() => {
      window.removeEventListener('NEOLine.N3.EVENT.READY', onReady);
      if (window.NEOLineN3) {
        window.NEOLineN3.Init().then(resolve, reject);
      } else {
        reject(new Error('NeoLine not installed. Get it at https://neoline.io.'));
      }
    }, timeoutMs);
  });
}

/** Convert our standard ContractInvocationMulti `Arg` into NeoLine's wire shape. */
function argToNeoLine(a: Arg): NeoLineArg {
  // The shapes are nearly identical — neon-dappkit's `Arg` adds a couple of
  // types NeoLine doesn't list, but for the ones we use (Hash160, Integer,
  // String, ByteArray, Boolean, Array, Any) the value is already compatible.
  return a as unknown as NeoLineArg;
}

export interface NeoLineProviderShape {
  /** Connected N-prefixed Neo3 address. */
  readonly address: string;
  readonly publicKey: string;
  readonly network: string;
  /** Sign + send. Returns the tx hash. */
  invokeFunction(req: ContractInvocationMulti): Promise<string>;
  /** Sign a message (used by some auth flows; not used by the vault today). */
  signMessage(req: { message: string }): Promise<{ publicKey: string; data: string; salt: string; message: string }>;
}

/**
 * Build a connected provider. Throws if the extension is missing.
 *
 * Caller should wire `NEOLine.N3.EVENT.{ACCOUNT,NETWORK}_CHANGED` and
 * `DISCONNECTED` listeners and drop the provider when any fire — the
 * connected address is baked into this object.
 */
export async function buildNeoLineProvider(): Promise<NeoLineProviderShape> {
  const cli = await getNeoLine();
  const acct = await cli.getAccount();
  const nets = await cli.getNetworks();

  return {
    address: acct.address,
    publicKey: acct.publicKey,
    network: nets.defaultNetwork,

    async invokeFunction(req: ContractInvocationMulti): Promise<string> {
      // ContractInvocationMulti is a list of invocations + a list of signers.
      // NeoLine has separate methods for single vs multiple invocations.
      const signers: NeoLineSigner[] = (req.signers ?? []).map((s) => ({
        account: (s as { account?: string }).account ?? acct.address,
        scopes: (s as { scopes?: number | string }).scopes ?? 'CalledByEntry',
      }));

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

/** Quick check the extension is even present (without forcing a connection). */
export function isNeoLineAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.NEOLineN3;
}
