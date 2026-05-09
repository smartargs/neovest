/**
 * Wallet connection context. Two backends behind one {@link useConnection}
 * hook:
 *
 *   - **NeoLine** — direct via `window.NEOLineN3` (browser extension).
 *   - **WalletConnect** — via Reown AppKit + appkit-neo3-adapter.
 *
 * State machine:
 *   - 'connecting' — adapter is establishing the session.
 *   - 'not_connected' — no wallet attached.
 *   - 'connected' — { kind, address, network }.
 *
 * Last-used backend is persisted in localStorage so refresh stays signed in.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  useAppKit,
  useAppKitAccount,
  useDisconnect,
  useAppKitProvider,
} from '@reown/appkit/react';
import type { Neo3Provider } from '@cityofzion/appkit-neo3-adapter';
import { isWalletAvailable } from './appkit';
import { buildNeoLineProvider, type NeoLineProviderShape } from './wallet/neoline-adapter';
import type { ContractInvocationMulti } from '@cityofzion/neon-dappkit-types';

export type WalletKind = 'neoline' | 'walletconnect';

const NEO3_NAMESPACE = 'neo3' as never; // AppKit's ChainNamespace doesn't include 'neo3' yet.
const STORAGE_KEY = 'neovest.wallet.kind';

export type ConnectionState =
  | { status: 'connecting' }
  | { status: 'not_connected' }
  | { status: 'connected'; kind: WalletKind; address: string; network: string };

/** Minimum interface both backends provide; everything the rest of the app uses. */
export interface UnifiedProvider {
  invokeFunction(req: ContractInvocationMulti): Promise<string | { hash: string }>;
}

interface ConnectionCtxValue {
  state: ConnectionState;
  connect: (kind: WalletKind) => Promise<void>;
  disconnect: () => Promise<void>;
  /** Connected wallet provider (or null if not connected). */
  provider: UnifiedProvider | null;
  /** Convenience flags. */
  isConnected: boolean;
  address: string | undefined;
  /** Whether the WalletConnect path is configured. */
  walletConnectAvailable: boolean;
}

const ConnectionCtx = createContext<ConnectionCtxValue | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const wcAvailable = isWalletAvailable();

  // Render different inner providers based on whether AppKit is initialized,
  // so its hooks aren't called when the project ID is unset.
  return wcAvailable ? (
    <DualBackendProvider>{children}</DualBackendProvider>
  ) : (
    <NeoLineOnlyProvider>{children}</NeoLineOnlyProvider>
  );
}

// ---------- Internal provider implementations ----------

function DualBackendProvider({ children }: { children: ReactNode }) {
  // ---- WalletConnect side (AppKit) ----
  const wcAcct = useAppKitAccount();
  const { open: openWc } = useAppKit();
  const { disconnect: disconnectWc } = useDisconnect();
  const { walletProvider: wcProvider } = useAppKitProvider<Neo3Provider>(NEO3_NAMESPACE);

  // ---- NeoLine side ----
  const [neoLineProvider, setNeoLineProvider] = useState<NeoLineProviderShape | null>(null);

  // Active backend (or null when not connected).
  const [activeKind, setActiveKind] = useState<WalletKind | null>(() => {
    if (typeof localStorage === 'undefined') return null;
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'neoline' || v === 'walletconnect' ? v : null;
  });

  const [state, setState] = useState<ConnectionState>(
    activeKind ? { status: 'connecting' } : { status: 'not_connected' },
  );
  const first = useRef(true);

  // Reconnect NeoLine on mount if it was the last-used backend.
  useEffect(() => {
    void (async () => {
      if (activeKind !== 'neoline') return;
      try {
        const p = await buildNeoLineProvider();
        setNeoLineProvider(p);
      } catch {
        setActiveKind(null);
        localStorage.removeItem(STORAGE_KEY);
      }
    })();
    // intentionally only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drop session on NeoLine account/network change.
  useEffect(() => {
    if (activeKind !== 'neoline') return;
    const drop = () => {
      setNeoLineProvider(null);
      setActiveKind(null);
      localStorage.removeItem(STORAGE_KEY);
    };
    window.addEventListener('NEOLine.N3.EVENT.DISCONNECTED', drop);
    window.addEventListener('NEOLine.N3.EVENT.ACCOUNT_CHANGED', drop);
    window.addEventListener('NEOLine.N3.EVENT.NETWORK_CHANGED', drop);
    return () => {
      window.removeEventListener('NEOLine.N3.EVENT.DISCONNECTED', drop);
      window.removeEventListener('NEOLine.N3.EVENT.ACCOUNT_CHANGED', drop);
      window.removeEventListener('NEOLine.N3.EVENT.NETWORK_CHANGED', drop);
    };
  }, [activeKind]);

  // Compute unified state.
  useEffect(() => {
    void (async () => {
      if (first.current) {
        await new Promise((r) => setTimeout(r, 800));
        first.current = false;
      }
      if (activeKind === 'neoline') {
        if (!neoLineProvider) {
          setState({ status: 'connecting' });
          return;
        }
        setState({
          status: 'connected',
          kind: 'neoline',
          address: neoLineProvider.address,
          network: neoLineProvider.network,
        });
        return;
      }
      if (activeKind === 'walletconnect') {
        if (wcAcct.status === 'connecting' || wcAcct.status === 'reconnecting') {
          setState({ status: 'connecting' });
          return;
        }
        if (!wcAcct.caipAddress) {
          setState({ status: 'not_connected' });
          return;
        }
        // caipAddress = "neo3:<networkId>:<N-address>"
        const parts = wcAcct.caipAddress.split(':');
        setState({
          status: 'connected',
          kind: 'walletconnect',
          address: parts[2] ?? '',
          network: parts[1] ?? '',
        });
        return;
      }
      setState({ status: 'not_connected' });
    })();
  }, [activeKind, neoLineProvider, wcAcct.status, wcAcct.caipAddress]);

  const connect = useCallback(async (kind: WalletKind) => {
    if (kind === 'neoline') {
      const p = await buildNeoLineProvider();
      setNeoLineProvider(p);
      setActiveKind('neoline');
      localStorage.setItem(STORAGE_KEY, 'neoline');
    } else {
      setActiveKind('walletconnect');
      localStorage.setItem(STORAGE_KEY, 'walletconnect');
      await openWc({ namespace: NEO3_NAMESPACE });
    }
  }, [openWc]);

  const disconnect = useCallback(async () => {
    if (activeKind === 'walletconnect') await disconnectWc();
    setNeoLineProvider(null);
    setActiveKind(null);
    localStorage.removeItem(STORAGE_KEY);
  }, [activeKind, disconnectWc]);

  const provider: UnifiedProvider | null =
    state.status === 'connected'
      ? state.kind === 'neoline'
        ? (neoLineProvider as UnifiedProvider | null)
        : (wcProvider as unknown as UnifiedProvider | null)
      : null;

  const value: ConnectionCtxValue = {
    state,
    connect,
    disconnect,
    provider,
    isConnected: state.status === 'connected',
    address: state.status === 'connected' ? state.address : undefined,
    walletConnectAvailable: true,
  };

  return <ConnectionCtx.Provider value={value}>{children}</ConnectionCtx.Provider>;
}

/** Used when WalletConnect isn't configured — only NeoLine is available. */
function NeoLineOnlyProvider({ children }: { children: ReactNode }) {
  const [neoLineProvider, setNeoLineProvider] = useState<NeoLineProviderShape | null>(null);
  const [active, setActive] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEY) === 'neoline';
  });
  const [state, setState] = useState<ConnectionState>(
    active ? { status: 'connecting' } : { status: 'not_connected' },
  );

  // Reconnect on mount.
  useEffect(() => {
    void (async () => {
      if (!active) return;
      try {
        const p = await buildNeoLineProvider();
        setNeoLineProvider(p);
        setState({ status: 'connected', kind: 'neoline', address: p.address, network: p.network });
      } catch {
        setActive(false);
        setState({ status: 'not_connected' });
        localStorage.removeItem(STORAGE_KEY);
      }
    })();
    // mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for NeoLine events.
  useEffect(() => {
    if (!active) return;
    const drop = () => {
      setNeoLineProvider(null);
      setActive(false);
      setState({ status: 'not_connected' });
      localStorage.removeItem(STORAGE_KEY);
    };
    window.addEventListener('NEOLine.N3.EVENT.DISCONNECTED', drop);
    window.addEventListener('NEOLine.N3.EVENT.ACCOUNT_CHANGED', drop);
    window.addEventListener('NEOLine.N3.EVENT.NETWORK_CHANGED', drop);
    return () => {
      window.removeEventListener('NEOLine.N3.EVENT.DISCONNECTED', drop);
      window.removeEventListener('NEOLine.N3.EVENT.ACCOUNT_CHANGED', drop);
      window.removeEventListener('NEOLine.N3.EVENT.NETWORK_CHANGED', drop);
    };
  }, [active]);

  const connect = useCallback(async (kind: WalletKind) => {
    if (kind !== 'neoline') {
      throw new Error('WalletConnect is not configured. Set VITE_WC_PROJECT_ID to enable it.');
    }
    const p = await buildNeoLineProvider();
    setNeoLineProvider(p);
    setActive(true);
    localStorage.setItem(STORAGE_KEY, 'neoline');
    setState({ status: 'connected', kind: 'neoline', address: p.address, network: p.network });
  }, []);

  const disconnect = useCallback(async () => {
    setNeoLineProvider(null);
    setActive(false);
    localStorage.removeItem(STORAGE_KEY);
    setState({ status: 'not_connected' });
  }, []);

  return (
    <ConnectionCtx.Provider
      value={{
        state,
        connect,
        disconnect,
        provider: neoLineProvider as UnifiedProvider | null,
        isConnected: state.status === 'connected',
        address: state.status === 'connected' ? state.address : undefined,
        walletConnectAvailable: false,
      }}
    >
      {children}
    </ConnectionCtx.Provider>
  );
}

export function useConnection(): ConnectionCtxValue {
  const v = useContext(ConnectionCtx);
  if (!v) throw new Error('useConnection must be used inside <ConnectionProvider>');
  return v;
}
