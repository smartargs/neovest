import { defaultNetwork, resolveRpcUrl } from '@/lib/rpc';

/**
 * Subtle top-of-page strip that surfaces non-mainnet networks. Hidden on
 * mainnet (no banner). Shown on testnet and localnet so it's impossible to
 * confuse a dev/test session with a production one.
 */
export function NetworkBanner() {
  const net = defaultNetwork();
  if (net === 'mainnet') return null;

  const rpc = resolveRpcUrl();
  const isLocal = net === 'localnet';
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
