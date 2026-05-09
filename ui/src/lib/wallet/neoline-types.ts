/**
 * Minimal type declarations for NeoLine's N3 dAPI. We only declare what we
 * actually call — the full surface is at https://neoline.io/dapi/N3.html.
 */

export type NeoLineArg =
  | { type: 'Hash160'; value: string }
  | { type: 'Integer'; value: string | number }
  | { type: 'String'; value: string }
  | { type: 'ByteArray'; value: string }
  | { type: 'Boolean'; value: boolean }
  | { type: 'Array'; value: NeoLineArg[] }
  | { type: 'Address'; value: string }
  | { type: 'Hash256'; value: string }
  | { type: 'PublicKey'; value: string }
  | { type: 'Any'; value: null };

export interface NeoLineSigner {
  account: string;                  // scripthash or address
  scopes: number | string;          // e.g. 'CalledByEntry'
  allowedContracts?: string[];
  allowedGroups?: string[];
}

export interface NeoLineInvokeArgs {
  scriptHash: string;
  operation: string;
  args?: NeoLineArg[];
  signers?: NeoLineSigner[];
  fee?: string;
  extraSystemFee?: string;
  broadcastOverride?: boolean;
}

export interface NeoLineN3 {
  getProvider(): Promise<{ name: string; version: string; compatibility: string[] }>;
  getNetworks(): Promise<{ networks: string[]; defaultNetwork: string; chainId?: number }>;
  getAccount(): Promise<{ address: string; label?: string; publicKey: string; isLedger?: boolean }>;
  invokeRead(p: NeoLineInvokeArgs): Promise<{
    script: string;
    state: 'HALT' | 'FAULT';
    gas_consumed: string;
    stack: unknown[];
    exception?: string;
    session?: string;
  }>;
  invokeReadMulti(p: { invokeReadArgs: NeoLineInvokeArgs[]; signers: NeoLineSigner[] }): Promise<unknown>;
  invoke(p: NeoLineInvokeArgs): Promise<{ txid: string; nodeUrl?: string; signedTx?: string }>;
  invokeMultiple(
    p: { invokeArgs: NeoLineInvokeArgs[]; signers: NeoLineSigner[] } & Partial<NeoLineInvokeArgs>,
  ): Promise<{ txid: string }>;
  signMessage(p: { message: string }): Promise<{ publicKey: string; data: string; salt: string; message: string }>;
  signMessageV2?: (p: { message: string }) => Promise<{
    publicKey: string;
    data: string;
    salt: string;
    message: string;
  }>;
}

declare global {
  interface Window {
    NEOLineN3?: { Init(): Promise<NeoLineN3> };
    NEOLine?: { Init(): Promise<unknown> };
  }
}

export {};
