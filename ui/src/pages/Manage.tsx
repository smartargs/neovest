import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CONTRACT, LOCKS, ME, TODAY, categoryColor, scheduleSummary, vestedAt, type Lock } from '@/lib/data';
import { fmtDate, fmtNum, fmtRelative } from '@/lib/format';
import { CategoryPill } from '@/components/CategoryPill';
import { ProgressSeg } from '@/components/ProgressSeg';
import {
  IconAdd,
  IconAlert,
  IconCheck,
  IconChevronDown,
  IconClaim,
  IconCopy,
  IconLock,
  IconStairs,
  IconTrending,
} from '@/components/icons';
import { MiniCurve } from '@/components/charts/MiniCurve';
import { useConnection } from '@/lib/connection';
import { claim as txClaim, revoke as txRevoke, waitForTx } from '@/lib/transactions';

type Tab = 'beneficiary' | 'depositor' | 'create';

export function Manage() {
  const today = TODAY;
  const { contractHash } = useParams<{ contractHash: string }>();
  const conn = useConnection();
  const qc = useQueryClient();

  const isDemo = !contractHash || contractHash === CONTRACT;
  // Real address from wallet when connected; fall back to mock ME on the demo
  // contract so screenshots still populate.
  const me = conn.isConnected && conn.address
    ? conn.address
    : (isDemo ? ME : undefined);

  const [tab, setTab] = useState<Tab>('beneficiary');
  const [pendingTx, setPendingTx] = useState<{ kind: 'claim' | 'revoke'; lockId: number } | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  // For demo we still filter by mock ME / hardcoded depositor; for real we
  // filter by the connected address (these are no-ops if the on-chain shape
  // doesn't match — addresses are always strings).
  const myBeneficiary = LOCKS.filter((l) => l.ben === me);
  const myDepositor = isDemo
    ? LOCKS.filter((l) => l.dep === '0xF7c2...91ad')
    : LOCKS.filter((l) => l.dep === me);

  /** Submit a write tx and wait for confirmation. */
  const onClaim = useCallback(async (lockId: number) => {
    if (!conn.provider || !conn.address || !contractHash) {
      setToast({ kind: 'err', msg: 'Connect a wallet first.' });
      return;
    }
    setPendingTx({ kind: 'claim', lockId });
    try {
      const txHash = await txClaim(conn.provider, contractHash, conn.address, lockId);
      setToast({ kind: 'ok', msg: 'Claim submitted, waiting for confirmation…' });
      await waitForTx(txHash, (import.meta.env.VITE_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet');
      setToast({ kind: 'ok', msg: 'Claim confirmed.' });
      // Invalidate any queries that depend on this lock's state.
      void qc.invalidateQueries({ queryKey: ['claimable', contractHash, lockId] });
      void qc.invalidateQueries({ queryKey: ['vested', contractHash, lockId] });
      void qc.invalidateQueries({ queryKey: ['lock', contractHash, lockId] });
      void qc.invalidateQueries({ queryKey: ['allLocks', contractHash] });
    } catch (e: unknown) {
      setToast({ kind: 'err', msg: 'Claim failed: ' + extractMsg(e) });
    } finally {
      setPendingTx(null);
    }
  }, [conn, contractHash, qc]);

  const onRevoke = useCallback(async (lockId: number) => {
    if (!conn.provider || !conn.address || !contractHash) {
      setToast({ kind: 'err', msg: 'Connect a wallet first.' });
      return;
    }
    setPendingTx({ kind: 'revoke', lockId });
    try {
      const txHash = await txRevoke(conn.provider, contractHash, conn.address, lockId);
      setToast({ kind: 'ok', msg: 'Revoke submitted, waiting for confirmation…' });
      await waitForTx(txHash, (import.meta.env.VITE_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet');
      setToast({ kind: 'ok', msg: 'Revoke confirmed.' });
      void qc.invalidateQueries({ queryKey: ['lock', contractHash, lockId] });
      void qc.invalidateQueries({ queryKey: ['allLocks', contractHash] });
    } catch (e: unknown) {
      setToast({ kind: 'err', msg: 'Revoke failed: ' + extractMsg(e) });
    } finally {
      setPendingTx(null);
    }
  }, [conn, contractHash, qc]);

  return (
    <div data-screen-label="Manage">
      <div className="page-header">
        <div>
          <h1 className="page-title">Manage locks</h1>
          <div className="page-subtitle">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span className="mono">0x7f3a...e2c1</span>
              <button
                className="icon-btn"
                style={{ width: 22, height: 22 }}
                aria-label="Copy contract"
                onClick={() => navigator.clipboard?.writeText(CONTRACT)}
              >
                <IconCopy size={12} />
              </button>
            </span>
            <span className="sep">·</span>
            {me ? (
              <span>
                Connected as{' '}
                <span className="mono" style={{ color: 'var(--text-primary)' }}>{me}</span>
              </span>
            ) : (
              <span style={{ color: 'var(--warning)' }}>No wallet connected — read-only</span>
            )}
          </div>
        </div>
      </div>

      <div className="tabs">
        <button className={tab === 'beneficiary' ? 'active' : ''} onClick={() => setTab('beneficiary')}>
          As beneficiary <span className="count">({myBeneficiary.length})</span>
        </button>
        <button className={tab === 'depositor' ? 'active' : ''} onClick={() => setTab('depositor')}>
          As depositor <span className="count">({myDepositor.length})</span>
        </button>
        <button className={tab === 'create' ? 'active' : ''} onClick={() => setTab('create')}>
          <IconAdd size={13} /> Create lock
        </button>
      </div>

      {tab === 'beneficiary' && (
        <BeneficiaryTab locks={myBeneficiary} today={today} onClaim={onClaim} pending={pendingTx} />
      )}
      {tab === 'depositor' && (
        <DepositorTab locks={myDepositor} today={today} onRevoke={onRevoke} pending={pendingTx} />
      )}
      {tab === 'create' && <CreateLockTab today={today} />}

      {toast && (
        <div className="toast-stack">
          <div className="toast">
            <span className="ic" style={{ color: toast.kind === 'ok' ? 'var(--success)' : 'var(--danger)' }}>
              {toast.kind === 'ok' ? <IconCheck size={14} /> : <IconAlert size={14} />}
            </span>
            <div style={{ flex: 1 }}>
              <div className="ti">{toast.msg}</div>
            </div>
            <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => setToast(null)}>
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function extractMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null) {
    const anyE = e as { description?: string; message?: string };
    return anyE.description ?? anyE.message ?? JSON.stringify(e);
  }
  return String(e);
}

// ---------- Beneficiary tab ----------

interface TabProps {
  locks: Lock[];
  today: Date;
}

interface BeneficiaryTabProps extends TabProps {
  onClaim: (lockId: number) => void | Promise<void>;
  pending: { kind: 'claim' | 'revoke'; lockId: number } | null;
}

function BeneficiaryTab({ locks, today, onClaim, pending }: BeneficiaryTabProps) {
  const totalClaimable = locks.reduce((s, l) => {
    const v = vestedAt(l, today) - (l.claimed ?? 0);
    return s + Math.max(0, v);
  }, 0);

  return (
    <div>
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: 6,
              }}
            >
              Your locked tokens
            </div>
            <div className="mono" style={{ fontSize: 28, fontWeight: 500, letterSpacing: '-0.01em' }}>
              {fmtNum(locks.reduce((s, l) => s + l.amount, 0))}
              <span style={{ color: 'var(--text-secondary)', fontSize: 14, marginLeft: 8 }}>
                LTC across {locks.length} locks
              </span>
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
              Claimable now:{' '}
              <span className="mono" style={{ color: 'var(--success)', fontWeight: 600 }}>
                {fmtNum(totalClaimable, { compact: true })} LTC
              </span>
            </div>
          </div>
          <button className="btn btn-primary btn-lg">
            <IconClaim size={14} /> Claim all
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {locks.map((l) => (
          <BeneficiaryLockCard
            key={l.id}
            lock={l}
            today={today}
            onClaim={onClaim}
            pendingClaim={pending?.kind === 'claim' && pending.lockId === l.id}
          />
        ))}
      </div>
    </div>
  );
}

function BeneficiaryLockCard({
  lock, today, onClaim, pendingClaim,
}: {
  lock: Lock;
  today: Date;
  onClaim: (lockId: number) => void | Promise<void>;
  pendingClaim: boolean;
}) {
  const vested = vestedAt(lock, today);
  const claimable = Math.max(0, vested - (lock.claimed ?? 0));
  const pct = (vested / lock.amount) * 100;
  const isLocked = vested === 0;
  const cliffSoon =
    lock.cliff && lock.cliff > today && lock.cliff.getTime() - today.getTime() < 60 * 24 * 3600 * 1000;

  return (
    <div className="lock-card">
      <div>
        <div className="lock-card-head">
          <CategoryPill catId={lock.cat} />
          <span className="sep">·</span>
          <span>From <span className="mono" style={{ color: 'var(--text-primary)' }}>{lock.dep}</span></span>
          <span className="sep">·</span>
          <span style={{ color: 'var(--text-secondary)' }}>"{lock.label}"</span>
        </div>
        <div className="lock-card-amount">
          {fmtNum(lock.amount)} <span className="sym">LTC</span>
        </div>
        <div className="lock-card-meta">
          {scheduleSummary(lock)} · {fmtDate(lock.start)} → {fmtDate(lock.end)}
        </div>
        <div className="lock-card-progress">
          <ProgressSeg pct={pct} color={categoryColor(lock.cat)} segments={14} />
          <span className="mono" style={{ fontSize: 12, color: 'var(--text-primary)' }}>
            {pct.toFixed(0)}% vested
          </span>
          {claimable > 0 ? (
            <span style={{ color: 'var(--success)' }}>
              · Claimable:{' '}
              <span className="mono" style={{ fontWeight: 500 }}>{fmtNum(claimable, { compact: true })} LTC</span>
            </span>
          ) : isLocked && lock.cliff ? (
            <span>
              · Cliff in{' '}
              <span className="mono" style={{ color: cliffSoon ? 'var(--warning)' : 'var(--text-primary)' }}>
                {fmtRelative(lock.cliff, today)}
              </span>
            </span>
          ) : (
            <span>· Not yet vested</span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        {claimable > 0 ? (
          <button
            className={'btn btn-primary' + (pendingClaim ? ' btn-disabled' : '')}
            onClick={() => onClaim(lock.id)}
            disabled={pendingClaim}
          >
            <IconClaim size={13} />
            {pendingClaim ? 'Claiming…' : `Claim ${fmtNum(claimable, { compact: true })}`}
          </button>
        ) : (
          <button className="btn btn-secondary btn-disabled">Not claimable</button>
        )}
        <button className="btn btn-ghost btn-sm">View detail →</button>
      </div>
    </div>
  );
}

// ---------- Depositor tab ----------

interface DepositorTabProps extends TabProps {
  onRevoke: (lockId: number) => void | Promise<void>;
  pending: { kind: 'claim' | 'revoke'; lockId: number } | null;
}

function DepositorTab({ locks, today, onRevoke, pending }: DepositorTabProps) {
  const total = locks.reduce((s, l) => s + l.amount, 0);
  const revoked = 0;
  const visible = locks.slice(0, 10);

  return (
    <div>
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 6,
            }}
          >
            Locks you created
          </div>
          <div className="mono" style={{ fontSize: 28, fontWeight: 500, letterSpacing: '-0.01em' }}>
            {fmtNum(total)}
            <span style={{ color: 'var(--text-secondary)', fontSize: 14, marginLeft: 8 }}>
              LTC across {locks.length} active · {revoked} revoked
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {visible.map((l) => (
          <DepositorLockCard
            key={l.id}
            lock={l}
            today={today}
            onRevoke={onRevoke}
            pendingRevoke={pending?.kind === 'revoke' && pending.lockId === l.id}
          />
        ))}
      </div>
      {locks.length > visible.length && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button className="btn btn-secondary">Show all {locks.length} locks</button>
        </div>
      )}
    </div>
  );
}

function DepositorLockCard({
  lock, today, onRevoke, pendingRevoke,
}: {
  lock: Lock;
  today: Date;
  onRevoke: (lockId: number) => void | Promise<void>;
  pendingRevoke: boolean;
}) {
  const vested = vestedAt(lock, today);
  const pct = (vested / lock.amount) * 100;

  return (
    <div className="lock-card">
      <div>
        <div className="lock-card-head">
          <CategoryPill catId={lock.cat} />
          <span className="sep">·</span>
          <span>To <span className="mono" style={{ color: 'var(--text-primary)' }}>{lock.ben}</span></span>
          <span className="sep">·</span>
          <span style={{ color: 'var(--text-secondary)' }}>"{lock.label}"</span>
        </div>
        <div className="lock-card-amount">
          {fmtNum(lock.amount)} <span className="sym">LTC</span>
        </div>
        <div className="lock-card-meta">
          {scheduleSummary(lock)} · Created {fmtDate(lock.start)} · Revocable:{' '}
          <span style={{ color: lock.rev ? 'var(--warning)' : 'var(--text-primary)' }}>
            {lock.rev ? 'Yes' : 'No'}
          </span>
        </div>
        <div className="lock-card-progress">
          <ProgressSeg pct={pct} color={categoryColor(lock.cat)} segments={14} />
          <span className="mono" style={{ fontSize: 12, color: 'var(--text-primary)' }}>{pct.toFixed(0)}% vested</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        <button className="btn btn-secondary">View detail →</button>
        {lock.rev && (
          <button
            className={'btn btn-danger btn-sm' + (pendingRevoke ? ' btn-disabled' : '')}
            onClick={() => onRevoke(lock.id)}
            disabled={pendingRevoke}
          >
            <IconAlert size={12} /> {pendingRevoke ? 'Revoking…' : 'Revoke'}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- Create Lock tab ----------

type ScheduleType = 'cliff' | 'linear' | 'stepped';

function CreateLockTab({ today }: { today: Date }) {
  const [scheduleType, setScheduleType] = useState<ScheduleType>('linear');
  const [revocable, setRevocable] = useState(false);

  const previewLock = {
    cat: 'team',
    type: scheduleType,
    start: new Date('2026-05-09T00:00:00Z'),
    end: new Date('2030-05-09T00:00:00Z'),
    cliff: scheduleType === 'linear' ? new Date('2027-05-09T00:00:00Z') : null,
    steps: 8,
    amount: 1_200_000_000,
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div className="card-title" style={{ fontSize: 18, marginBottom: 4 }}>Create a new lock</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 700 }}>
          Tokens are pulled from your wallet and locked according to the schedule below. Once created, locks are
          immutable unless explicitly marked revocable.
        </div>
      </div>

      <div className="form-grid">
        <div className="card card-pad form-section">
          <div className="field">
            <label>Token</label>
            <div className="field-row">
              <div className="token-selector" style={{ flex: 1 }}>
                <span className="token-logo">L</span>
                <div style={{ flex: 1 }}>
                  <div className="name">Lattice (LTC)</div>
                  <div className="total mono">Balance: 9,512,300,000</div>
                </div>
                <IconChevronDown />
              </div>
            </div>
          </div>

          <div className="field">
            <label>Beneficiary</label>
            <input className="input mono" defaultValue="0xA1b33Bf28d2c4e8f9a1b4c7e2d5f8a91" />
            <span className="ok"><IconCheck size={12} /> Valid Neo address · 0xA1b3…3Bf2</span>
          </div>

          <div className="field">
            <label>Amount</label>
            <div className="amount-input">
              <input className="input" defaultValue="1,200,000,000" />
              <span className="sym">LTC</span>
            </div>
            <div className="quick-pcts">
              <button>25%</button>
              <button>50%</button>
              <button>Max</button>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }} className="mono">
                ≈ 12.6% of balance
              </span>
            </div>
          </div>

          <div className="field">
            <label>Schedule type</label>
            <div className="radio-cards">
              <div
                className={'radio-card ' + (scheduleType === 'cliff' ? 'active' : '')}
                onClick={() => setScheduleType('cliff')}
              >
                <IconLock className="ic" size={16} />
                <div className="name">Cliff</div>
                <div className="desc">All tokens unlock on a single date.</div>
              </div>
              <div
                className={'radio-card ' + (scheduleType === 'linear' ? 'active' : '')}
                onClick={() => setScheduleType('linear')}
              >
                <IconTrending className="ic" size={16} />
                <div className="name">Linear</div>
                <div className="desc">Vest continuously between two dates, optional cliff.</div>
              </div>
              <div
                className={'radio-card ' + (scheduleType === 'stepped' ? 'active' : '')}
                onClick={() => setScheduleType('stepped')}
              >
                <IconStairs className="ic" size={16} />
                <div className="name">Stepped</div>
                <div className="desc">Unlock equal tranches at fixed intervals.</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field">
              <label>Start date</label>
              <input className="input mono" defaultValue="2026-05-09 00:00 UTC" />
            </div>
            <div className="field">
              <label>End date</label>
              <input className="input mono" defaultValue="2030-05-09 00:00 UTC" />
            </div>
          </div>

          {scheduleType === 'linear' && (
            <div className="field">
              <label>
                Cliff <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(optional)</span>
              </label>
              <input className="input mono" defaultValue="2027-05-09 00:00 UTC" />
              <span className="hint">No tokens vest before this date.</span>
            </div>
          )}

          {scheduleType === 'stepped' && (
            <div className="field">
              <label>Number of tranches</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="input mono" defaultValue="8" style={{ maxWidth: 100 }} />
                <span className="hint">150,000,000 LTC unlocks every ~6 months.</span>
              </div>
            </div>
          )}

          <div className="field">
            <label>Category</label>
            <select className="select" defaultValue="team">
              <option value="team">Team</option>
              <option value="investor">Investors</option>
              <option value="treasury">Treasury</option>
              <option value="public">Public</option>
              <option value="advisor">Advisors</option>
              <option value="partner">Partners</option>
            </select>
          </div>

          <div className="field">
            <label>
              Note <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(optional, public)</span>
            </label>
            <input className="input" defaultValue="Founder allocation" />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="hint">Stored on-chain. Visible to everyone.</span>
              <span className="hint mono">21 / 256</span>
            </div>
          </div>

          <div className={'check-row ' + (revocable ? 'on' : '')} onClick={() => setRevocable(!revocable)}>
            <div className="box">{revocable && <IconCheck size={11} />}</div>
            <div>
              <div className="lbl">Allow me to revoke unvested portion</div>
              <div className="desc">Revocable locks are less trustworthy from the beneficiary's perspective.</div>
            </div>
          </div>

          <div className="divider" />

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>One transaction.</strong> Tokens
              transfer to the vault with your lock parameters attached.
            </div>
            <button className="btn btn-primary btn-lg">
              <IconLock size={14} /> Create lock
            </button>
          </div>
        </div>

        <div>
          <div className="preview-card">
            <div className="card-header">
              <div>
                <div className="card-title">Live preview</div>
                <div className="card-subtitle">Updates as you edit the form</div>
              </div>
              <CategoryPill catId="team" />
            </div>

            <div
              className="chart-wrap"
              style={{
                height: 130,
                marginBottom: 16,
                padding: '8px 0',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 6,
              }}
            >
              <MiniCurve width={420} height={130} lock={previewLock as never} today={today} />
            </div>

            <dl className="dl">
              <dt>Beneficiary</dt><dd>0xA1b3…3Bf2</dd>
              <dt>Amount</dt><dd>1,200,000,000 LTC</dd>
              <dt>Type</dt>
              <dd>
                {scheduleType === 'linear'
                  ? 'Linear with cliff'
                  : scheduleType === 'cliff'
                  ? 'Cliff'
                  : 'Stepped'}
              </dd>
              <dt>Starts</dt><dd>May 9, 2026</dd>
              {scheduleType === 'linear' && (<><dt>Cliff ends</dt><dd>May 9, 2027</dd></>)}
              {scheduleType === 'stepped' && (<><dt>Tranches</dt><dd>8 × 150M LTC</dd></>)}
              <dt>Fully vested</dt><dd>May 9, 2030</dd>
              <dt>First claim</dt><dd>May 9, 2027</dd>
              <dt style={{ paddingLeft: 12, color: 'var(--text-tertiary)' }}>↳ amount</dt>
              <dd style={{ color: 'var(--success)', fontWeight: 500 }}>300,000,000 LTC</dd>
            </dl>

            <div className="divider" />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div
                style={{
                  padding: '10px 12px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 6,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text-tertiary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: 4,
                  }}
                >
                  Network fee
                </div>
                <div className="mono" style={{ fontSize: 13, color: 'var(--text-primary)' }}>~0.082 GAS</div>
              </div>
              <div
                style={{
                  padding: '10px 12px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 6,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text-tertiary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: 4,
                  }}
                >
                  Vault fee
                </div>
                <div className="mono" style={{ fontSize: 13, color: 'var(--text-primary)' }}>None</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
