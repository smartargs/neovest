import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { wallet as neonWallet } from '@cityofzion/neon-js';
import { KNOWN_DEPLOYMENTS } from '@/lib/known-deployments';
import { useConnection } from '@/lib/connection';
import { useVaultRoles } from '@/lib/hooks';
import { getHistory, removeFromHistory, type VaultHistoryEntry } from '@/lib/vault-history';
import { fmtRelative } from '@/lib/format';
import { IconChevronRight, IconCheck, IconLock, IconClaim, IconStairs } from '@/components/icons';

export function Landing() {
  const [hash, setHash] = useState('');
  const navigate = useNavigate();
  const conn = useConnection();
  const [history, setHistory] = useState<VaultHistoryEntry[]>(() => getHistory());

  // localStorage doesn't fire "storage" for same-tab updates; refresh on mount.
  useEffect(() => {
    setHistory(getHistory());
  }, []);

  function open(e: React.FormEvent) {
    e.preventDefault();
    const v = hash.trim();
    if (!v) return;
    navigate(`/v/${v}`);
  }

  const meHash = useMemo(() => {
    if (!conn.address) return undefined;
    if (conn.address.startsWith('0x')) return conn.address.toLowerCase();
    try {
      return '0x' + neonWallet.getScriptHashFromAddress(conn.address);
    } catch {
      return undefined;
    }
  }, [conn.address]);

  function forget(hashToForget: string) {
    removeFromHistory(hashToForget);
    setHistory(getHistory());
  }

  return (
    <div data-screen-label="Landing">
      {/* Hero — compact, with input inline. */}
      <section className="hero-v2">
        <div className="hero-v2-inner">
          <span className="hero-eyebrow">
            <span className="hero-dot" /> Neo N3 token vesting
          </span>
          <h1 className="hero-title">
            Lock. <span className="grad">Vest.</span> <span className="grad">Claim.</span>
          </h1>
          <p className="hero-sub">
            An audited, immutable vesting vault for any NEP-17 token. Deploy in one signed
            transaction; beneficiaries claim straight from chain.
          </p>

          <form onSubmit={open} className="hero-input-row">
            <input
              className="input mono"
              placeholder="0x… (paste a vault hash)"
              value={hash}
              onChange={(e) => setHash(e.target.value)}
              spellCheck={false}
            />
            <button className="btn btn-primary btn-lg" type="submit">
              Open <IconChevronRight size={14} />
            </button>
          </form>
          <div className="hero-quick-links">
            <Link to="/deploy" className="hero-link">
              <IconLock size={12} /> Deploy a vault
            </Link>
            <span className="dot-sep" />
            <Link to="/v/demo" className="hero-link">
              <IconChevronRight size={12} /> Tour demo
            </Link>
          </div>
        </div>
      </section>

      <div className="landing-body">
        {/* Above-the-fold: vaults panel */}
        <section className="vaults-panel">
          <div className="panel-header">
            <h2 className="panel-title">Your vaults</h2>
            <span className="panel-meta">
              {history.length === 0
                ? 'Vaults you visit will appear here'
                : `${history.length} recent`}
            </span>
          </div>

          {history.length === 0 ? (
            <EmptyVaultsState />
          ) : (
            <div className="vaults-list">
              {history.map((entry) => (
                <HistoryRow key={entry.hash} entry={entry} meHash={meHash} onForget={forget} />
              ))}
            </div>
          )}

          {history.length > 0 && !conn.isConnected && (
            <div className="panel-footer">
              Connect a wallet on the Manage page to see role badges (owner, depositor, beneficiary)
              next to each vault.
            </div>
          )}
        </section>

        {/* Features (below the fold for newcomers) */}
        <section className="feature-strip">
          <FeatureCard
            icon={<IconCheck size={16} />}
            title="Verifiable bytecode"
            body="Dashboard cross-checks the deployed contract's checksum against the bundled audited source."
          />
          <FeatureCard
            icon={<IconStairs size={16} />}
            title="Cliff + linear schedules"
            body="One-shot cliffs or smooth linear vesting with optional cliffs. Beneficiaries see live curves."
          />
          <FeatureCard
            icon={<IconClaim size={16} />}
            title="Beneficiary-controlled"
            body="The contract holds tokens. Beneficiaries claim directly. No hot wallet, no operator."
          />
          <FeatureCard
            icon={<IconLock size={16} />}
            title="Multi-token"
            body="Any NEP-17 token, multiple per vault. One deployment for your project's whole vesting plan."
          />
        </section>

        {/* Known deployments */}
        {KNOWN_DEPLOYMENTS.length > 0 && (
          <section style={{ marginTop: 32 }}>
            <SectionHeader>Known deployments</SectionHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {KNOWN_DEPLOYMENTS.map((d) => (
                <Link
                  key={d.hash}
                  to={`/v/${d.hash}`}
                  className="card card-pad-sm"
                  style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: 12 }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>{d.name}</div>
                    <div className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{d.hash}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>{d.description}</div>
                  </div>
                  <span className="badge">{d.network}</span>
                  <IconChevronRight size={16} />
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function EmptyVaultsState() {
  return (
    <div className="vaults-empty">
      <div className="vaults-empty-icon">
        <IconLock size={20} />
      </div>
      <div className="vaults-empty-title">No vaults visited yet</div>
      <div className="vaults-empty-body">
        Paste a contract hash in the bar above, deploy a fresh vault, or open the demo.
      </div>
      <div className="vaults-empty-actions">
        <Link to="/deploy" className="btn btn-primary btn-sm">
          <IconLock size={12} /> Deploy
        </Link>
        <Link to="/v/demo" className="btn btn-secondary btn-sm">
          Open demo <IconChevronRight size={12} />
        </Link>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="feat">
      <div className="feat-icon">{icon}</div>
      <div className="feat-title">{title}</div>
      <div className="feat-body">{body}</div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--text-tertiary)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function HistoryRow({
  entry,
  meHash,
  onForget,
}: {
  entry: VaultHistoryEntry;
  meHash: string | undefined;
  onForget: (hash: string) => void;
}) {
  const isDemo = entry.hash.toLowerCase() === 'demo';
  const { data: roles } = useVaultRoles(entry.hash, meHash);
  const visited = fmtRelative(new Date(entry.visitedAt), new Date());

  return (
    <Link to={`/v/${entry.hash}`} className="vault-row">
      <div className="vault-row-icon">
        <IconLock size={14} />
      </div>
      <div className="vault-row-main">
        <div className="vault-row-title">
          {isDemo ? 'Demo vault' : <span className="mono">{shortHash(entry.hash)}</span>}
        </div>
        <div className="vault-row-meta">last visited {visited}</div>
      </div>
      <div className="vault-row-badges">
        {roles?.isOwner && <RoleBadge color="var(--accent)" label="Owner" />}
        {roles?.isDepositor && <RoleBadge color="var(--info)" label="Depositor" />}
        {roles?.isBeneficiary && <RoleBadge color="var(--success)" label="Beneficiary" />}
      </div>
      <button
        className="vault-row-forget"
        title="Forget"
        aria-label="Forget vault"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onForget(entry.hash);
        }}
      >
        ×
      </button>
      <IconChevronRight size={14} />
    </Link>
  );
}

function RoleBadge({ color, label }: { color: string; label: string }) {
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        color,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
        padding: '2px 8px',
        borderRadius: 4,
      }}
    >
      {label}
    </span>
  );
}

function shortHash(s: string): string {
  if (!s) return '';
  if (s.length <= 14) return s;
  return s.slice(0, 8) + '…' + s.slice(-6);
}
