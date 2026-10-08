import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useConnection } from '@/lib/connection';
import { defaultNetwork } from '@/lib/rpc';
import { networkLabel, walletMatchesApp } from '@/lib/wallet-network';
import { isSigningPage, readOnlyPathFor, useNeoLineExtensionNetwork } from '@/lib/extension-network';
import { IconAlert } from './icons';

export function NetworkMismatchDialog() {
  const { state, networkMismatch, disconnect } = useConnection();
  const extension = useNeoLineExtensionNetwork();
  const { pathname } = useLocation();
  const primaryButton = useRef<HTMLButtonElement>(null);

  const app = defaultNetwork();
  const connected = state.status === 'connected' ? state : null;
  const extensionMismatch = extension != null && !walletMatchesApp(extension.walletNetwork, app);
  const open = (connected != null && networkMismatch) || (connected == null && extensionMismatch && isSigningPage(pathname));

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    primaryButton.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  const appLabel = networkLabel(app);
  const walletKind = connected ? (connected.kind === 'neoline' ? 'NeoLine' : 'WalletConnect') : 'NeoLine';
  const walletNetwork = connected ? connected.walletNetwork : extension?.walletNetwork ?? 'unknown';
  const rawLabel = connected ? connected.network : extension?.label ?? '';
  const walletLabel = networkLabel(walletNetwork) + (rawLabel ? ` ("${rawLabel}")` : '');
  const unknown = walletNetwork === 'unknown';
  const leaveTo = readOnlyPathFor(pathname);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="network-mismatch-title"
        className="card card-pad"
        style={{ maxWidth: 480, width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--danger)' }}>
          <IconAlert size={20} />
          <div id="network-mismatch-title" className="card-title" style={{ fontSize: 17 }}>
            Wallet is on the wrong network
          </div>
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          This site reads <strong style={{ color: 'var(--text-primary)' }}>{appLabel}</strong>.{' '}
          {unknown ? (
            <>It could not determine which network {walletKind} is set to.</>
          ) : (
            <>
              {walletKind} is set to{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{walletLabel}</strong>.
            </>
          )}{' '}
          Anything you signed would be sent to the wallet's network, not the one shown here, so
          this page stays blocked until the two match.
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {walletKind === 'NeoLine'
            ? <>Switch NeoLine to {appLabel}. This dialog closes by itself when the network changes.</>
            : <>Disconnect, select {appLabel} in your wallet, and reconnect.</>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Link to={leaveTo} className="btn btn-secondary">
            Leave this page
          </Link>
          {connected && (
            <button ref={primaryButton} className="btn btn-primary" onClick={() => void disconnect()}>
              Disconnect wallet
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
