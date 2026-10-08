import { clearRpcOverride, defaultNetwork, getRpcOverride, resolveRpcUrl } from '@/lib/rpc';

export function NetworkBanner() {
  const net = defaultNetwork();
  const override = getRpcOverride();
  return (
    <>
      {override && <RpcOverrideBanner url={override} />}
      {net !== 'mainnet' && <NetworkStrip isLocal={net === 'localnet'} rpc={resolveRpcUrl()} />}
    </>
  );
}

function RpcOverrideBanner({ url }: { url: string }) {
  function reset() {
    clearRpcOverride();
    window.location.reload();
  }
  return (
    <div
      role="alert"
      style={{
        background: 'var(--danger-muted)',
        color: 'var(--text-primary)',
        padding: '10px 16px',
        fontSize: 13,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        flexWrap: 'wrap',
        borderBottom: '1px solid color-mix(in srgb, var(--danger) 40%, transparent)',
      }}
    >
      <span>
        <strong style={{ color: 'var(--danger)' }}>Custom RPC endpoint in use.</strong>{' '}
        Everything on this site, including the bytecode verification badge, is reported by{' '}
        <span className="mono" style={{ wordBreak: 'break-all' }}>{url}</span> instead of the default node.
        Do not trust what you see here unless you set this endpoint yourself.
      </span>
      <button className="btn btn-secondary btn-sm" onClick={reset}>
        Reset to default
      </button>
    </div>
  );
}

function NetworkStrip({ isLocal, rpc }: { isLocal: boolean; rpc: string }) {
  const accent = isLocal ? 'var(--info)' : 'var(--warning)';
  const bg = isLocal ? 'var(--info-muted)' : 'var(--warning-muted)';
  const label = isLocal ? 'Localnet' : 'Testnet';
  return (
    <div
      role="status"
      aria-label={`Connected to ${label}`}
      style={{
        background: bg,
        color: accent,
        padding: '6px 16px',
        textAlign: 'center',
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: '0.01em',
        borderBottom: `1px solid color-mix(in srgb, ${accent} 30%, transparent)`,
      }}
    >
      <span style={{ marginRight: 8 }}>● {label}</span>
      <span style={{ color: 'var(--text-tertiary)', fontFamily: "'JetBrains Mono', monospace" }}>
        {rpc}
      </span>
    </div>
  );
}
