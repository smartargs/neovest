import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { wallet as neonWallet } from '@cityofzion/neon-js';
import { KNOWN_DEPLOYMENTS } from '@/lib/known-deployments';
import { useConnection } from '@/lib/connection';
import { contractExists } from '@/lib/contract';
import { defaultNetwork } from '@/lib/rpc';
import { useVaultRoles } from '@/lib/hooks';
import { getHistory, removeFromHistory, type VaultHistoryEntry } from '@/lib/vault-history';

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function shortHash(h: string): string {
  if (!h || h.length < 14) return h;
  return `${h.slice(0, 10)}…${h.slice(-8)}`;
}

function timeAgo(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

const HOW_IT_WORKS: { t: string; d: string }[] = [
  {
    t: 'Owner-only deposits.',
    d: 'The address set at deploy time is the only one that can move tokens into the vault — no admin override, no upgrade path.',
  },
  {
    t: 'Schedule types.',
    d: 'Cliff or linear schedules with optional cliff, configurable per beneficiary. Stepped schedules are supported on-chain; UI form is on the roadmap.',
  },
  {
    t: 'Beneficiary-controlled claims.',
    d: 'The contract holds tokens and beneficiaries claim directly. No hot wallet, no operator on the path.',
  },
  {
    t: 'Verifiable bytecode.',
    d: 'The dashboard cross-checks the deployed contract’s NEF checksum against the audited source bundled with this build.',
  },
];

// ────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: 'Owner' | 'Depositor' | 'Beneficiary' }) {
  const cls =
    role === 'Owner' ? 'owner' :
    role === 'Depositor' ? 'depositor' :
    'beneficiary';
  return <span className={`badge nv-role ${cls}`}>{role}</span>;
}

function VaultRow({
  entry,
  meHash,
  isConnected,
  onForget,
}: {
  entry: VaultHistoryEntry;
  meHash: string | undefined;
  isConnected: boolean;
  onForget: (hash: string) => void;
}) {
  const navigate = useNavigate();
  const { data: roles } = useVaultRoles(entry.hash, meHash);

  const isDemo = entry.hash.toLowerCase() === 'demo';
  const target = isDemo ? '/v/demo' : `/v/${entry.hash}`;

  const visibleRoles = isConnected && roles
    ? (['Owner', 'Depositor', 'Beneficiary'] as const).filter((r) => {
        if (r === 'Owner') return roles.isOwner;
        if (r === 'Depositor') return roles.isDepositor;
        return roles.isBeneficiary;
      })
    : [];

  function onForgetClick(e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    onForget(entry.hash);
  }

  return (
    <li
      className="nv-vault"
      role="link"
      tabIndex={0}
      onClick={() => navigate(target)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') navigate(target);
      }}
    >
      <div className="nv-vault-main">
        <div className="nv-vault-row1">
          {isDemo ? (
            <span className="nv-vault-name">
              Demo vault
              <span className="nv-vault-tag">read-only</span>
            </span>
          ) : (
            <span className="nv-vault-hash">{shortHash(entry.hash)}</span>
          )}
          {visibleRoles.length > 0 && (
            <span className="nv-roles">
              {visibleRoles.map((r) => (
                <RoleBadge key={r} role={r} />
              ))}
            </span>
          )}
        </div>
        <div className="nv-vault-meta">last visited {timeAgo(entry.visitedAt)}</div>
      </div>
      <div className="nv-vault-actions">
        <button
          className="nv-iconbtn nv-forget"
          aria-label="Forget vault"
          title="Forget"
          onClick={onForgetClick}
        >
          ×
        </button>
      </div>
      <div className="nv-chev" aria-hidden>›</div>
    </li>
  );
}

// ────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────

export function Landing() {
  const navigate = useNavigate();
  const conn = useConnection();
  const [hash, setHash] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [history, setHistory] = useState<VaultHistoryEntry[]>(() => getHistory());

  // localStorage doesn't fire "storage" for same-tab updates; refresh on mount.
  useEffect(() => {
    setHistory(getHistory());
  }, []);

  const meHash = useMemo(() => {
    if (!conn.address) return undefined;
    if (conn.address.startsWith('0x')) return conn.address.toLowerCase();
    try {
      return '0x' + neonWallet.getScriptHashFromAddress(conn.address);
    } catch {
      return undefined;
    }
  }, [conn.address]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLookupError(null);
    const h = hash.trim();
    if (!h) return;
    if (h.toLowerCase() === 'demo') {
      navigate('/v/demo');
      return;
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(h)) {
      setLookupError('Not a valid contract hash. Expected 0x + 40 hex characters.');
      return;
    }
    setVerifying(true);
    const exists = await contractExists(h);
    setVerifying(false);
    if (!exists) {
      setLookupError(`No contract deployed at this hash on ${defaultNetwork()}.`);
      return;
    }
    navigate(`/v/${h.toLowerCase()}`);
  }

  function onForget(h: string) {
    removeFromHistory(h);
    setHistory(getHistory());
  }

  return (
    <div data-screen-label="Landing" className="nv-landing">
      {/* Hero */}
      <section className="nv-hero">
        <div className="nv-eyebrow">Open-source · Neo N3</div>
        <h1 className="page-title nv-title">Token vesting on Neo N3.</h1>
        <p className="nv-lede">
          NeoVest is a dashboard for token-vesting vaults — verifiable bytecode, owner-only
          deposits, beneficiary-controlled claims. Paste a contract hash to open its
          dashboard.
        </p>

        <form className="nv-lookup" onSubmit={(e) => void onSubmit(e)}>
          <input
            className="input mono"
            placeholder="0x… vault contract hash"
            value={hash}
            onChange={(e) => {
              setHash(e.target.value);
              if (lookupError) setLookupError(null);
            }}
            spellCheck={false}
            autoComplete="off"
            disabled={verifying}
          />
          <button className="btn btn-primary btn-lg" type="submit" disabled={verifying}>
            {verifying ? 'Checking…' : 'Open'}
          </button>
        </form>
        {lookupError && (
          <div
            style={{
              marginTop: 8,
              padding: '8px 12px',
              background: 'var(--danger-muted)',
              color: 'var(--danger)',
              borderRadius: 6,
              fontSize: 12.5,
              maxWidth: 560,
            }}
          >
            {lookupError}
          </div>
        )}

        <div className="nv-quicklinks">
          <Link to="/deploy">
            Deploy a vault<span className="nv-arrow">↗</span>
          </Link>
          <span className="nv-sep">·</span>
          <Link to="/v/demo">
            Tour the demo vault<span className="nv-arrow">↗</span>
          </Link>
        </div>
      </section>

      {/* Your vaults */}
      {history.length > 0 && (
        <section className="nv-section">
          <div className="nv-section-head">
            <span className="nv-section-label">Your vaults</span>
            <span className="nv-section-meta">
              {history.length} {history.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>
          <ul className="nv-vault-list">
            {history.map((h) => (
              <VaultRow
                key={h.hash}
                entry={h}
                meHash={meHash}
                isConnected={conn.isConnected}
                onForget={onForget}
              />
            ))}
          </ul>
          {!conn.isConnected && (
            <div className="nv-section-foot">
              Connect a wallet on the Manage page to see role badges (owner, depositor,
              beneficiary) next to each vault.
            </div>
          )}
        </section>
      )}

      {/* How it works */}
      <section className="nv-section">
        <div className="nv-section-head">
          <span className="nv-section-label">How it works</span>
        </div>
        <ul className="nv-bullets">
          {HOW_IT_WORKS.map((b, i) => (
            <li key={i}>
              <b>{b.t}</b> {b.d}
            </li>
          ))}
        </ul>
      </section>

      {/* Known deployments */}
      {KNOWN_DEPLOYMENTS.length > 0 && (
        <section className="nv-section">
          <div className="nv-section-head">
            <span className="nv-section-label">Known deployments</span>
          </div>
          <ul className="nv-deploy-list">
            {KNOWN_DEPLOYMENTS.map((d) => (
              <li
                key={d.hash}
                className="nv-deploy"
                role="link"
                tabIndex={0}
                onClick={() => navigate(`/v/${d.hash}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') navigate(`/v/${d.hash}`);
                }}
              >
                <span className="nv-deploy-net">{d.network}</span>
                <div className="nv-deploy-main">
                  <div className="nv-deploy-name">{d.name}</div>
                  <div className="nv-deploy-hash">{d.hash}</div>
                  {d.description && <div className="nv-deploy-desc">{d.description}</div>}
                </div>
                <span className="nv-deploy-arrow">→</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
