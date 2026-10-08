import { useEffect, useRef } from 'react';
import { useConnection } from '@/lib/connection';
import { defaultNetwork } from '@/lib/rpc';
import { networkLabel } from '@/lib/wallet-network';
import { IconAlert } from './icons';

export function NetworkMismatchDialog() {
  const { state, networkMismatch, disconnect } = useConnection();
  const disconnectButton = useRef<HTMLButtonElement>(null);
  const open = networkMismatch && state.status === 'connected';

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    disconnectButton.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || state.status !== 'connected') return null;

  const appLabel = networkLabel(defaultNetwork());
  const walletKind = state.kind === 'neoline' ? 'NeoLine' : 'WalletConnect';
  const unknown = state.walletNetwork === 'unknown';
  const walletLabel = networkLabel(state.walletNetwork) + (state.network ? ` ("${state.network}")` : '');

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
            <>It could not determine which network {walletKind} is connected to.</>
          ) : (
            <>
              {walletKind} is connected to{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{walletLabel}</strong>.
            </>
          )}{' '}
          Anything you signed would be sent to the wallet's network, not the one shown here, so
          the site stays blocked until the two match.
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {state.kind === 'neoline'
            ? <>Switch NeoLine to {appLabel}. The connection resets when the network changes; then reconnect.</>
            : <>Disconnect, select {appLabel} in your wallet, and reconnect.</>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button ref={disconnectButton} className="btn btn-primary" onClick={() => void disconnect()}>
            Disconnect wallet
          </button>
        </div>
      </div>
    </div>
  );
}
