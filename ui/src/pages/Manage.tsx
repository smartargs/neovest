import { useState, useCallback, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { categoryColor, scheduleSummary, vestedAt, type Lock } from '@/lib/data';
import { useAllLocks, useOwner, useTokenInfo } from '@/lib/hooks';
import { isDemoVault, DEMO_LOCKS } from '@/lib/demo-data';
import { addToHistory } from '@/lib/vault-history';
import { fmtDate, fmtRelative, fmtTokenAmount } from '@/lib/format';
import { CategoryPill } from '@/components/CategoryPill';
import { ProgressSeg } from '@/components/ProgressSeg';
import {
  IconAdd,
  IconAlert,
  IconCheck,
  IconClaim,
  IconCopy,
  IconLock,
  IconStairs,
  IconTrending,
} from '@/components/icons';
import { MiniCurve } from '@/components/charts/MiniCurve';
import { useConnection } from '@/lib/connection';
import { claim as txClaim, revoke as txRevoke, createLock, waitForTx } from '@/lib/transactions';
import { wallet as neonWallet } from '@cityofzion/neon-js';

type Tab = 'beneficiary' | 'depositor' | 'create';

export function Manage() {
  const today = useMemo(() => new Date(), []);
  const { contractHash } = useParams<{ contractHash: string }>();
  const conn = useConnection();
  const qc = useQueryClient();

  // Track manage visits in vault history too.
  useEffect(() => {
    if (contractHash) addToHistory(contractHash);
  }, [contractHash]);

  const isDemo = isDemoVault(contractHash);
  const me = conn.isConnected ? conn.address : undefined;
  // On-chain locks store dep/ben as 0x-scripthash; wallets give us N-addresses.
  // Normalize the wallet side once for filtering.
  // The demo vault always shows pre-canned data, regardless of whether a
  // wallet is connected — Alice acts as the beneficiary, the demo depositor
  // as the creator.
  const meHash = useMemo(() => {
    if (isDemo) return DEMO_LOCKS[0].ben.toLowerCase();
    if (!me) return undefined;
    if (me.startsWith('0x')) return me.toLowerCase();
    try {
      return '0x' + neonWallet.getScriptHashFromAddress(me);
    } catch {
      return undefined;
    }
  }, [me, isDemo]);
  const meDepositorHash = useMemo(() => {
    if (isDemo) return DEMO_LOCKS[0].dep.toLowerCase();
    return meHash;
  }, [isDemo, meHash]);
  const { data: allLocks } = useAllLocks(contractHash ?? '');
  const items: Lock[] = (allLocks ?? []) as unknown as Lock[];

  const [tab, setTab] = useState<Tab>('beneficiary');
  const [pendingTx, setPendingTx] = useState<{ kind: 'claim' | 'revoke'; lockId: number } | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  // Filter the full lock list by the connected wallet's role.
  // `dep`/`ben` are 0x-scripthashes set by the on-chain decoder.
  const myBeneficiary = useMemo(
    () => (meHash ? items.filter((l) => l.ben.toLowerCase() === meHash) : []),
    [items, meHash],
  );
  const myDepositor = useMemo(
    () => (meDepositorHash ? items.filter((l) => l.dep.toLowerCase() === meDepositorHash) : []),
    [items, meDepositorHash],
  );

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
      await waitForTx(txHash);
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
      await waitForTx(txHash);
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
              <span className="mono">{shortAddr(contractHash ?? '')}</span>
              <button
                className="icon-btn"
                style={{ width: 22, height: 22 }}
                aria-label="Copy contract"
                onClick={() => contractHash && navigator.clipboard?.writeText(contractHash)}
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
    const anyE = e as {
      description?: string;
      message?: string;
      data?: { exception?: string; message?: string };
      exception?: string;
    };
    return (
      anyE.exception ??
      anyE.data?.exception ??
      anyE.description ??
      anyE.message ??
      anyE.data?.message ??
      JSON.stringify(e)
    );
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
              {fmtTokenAmount(locks.reduce((s, l) => s + l.amount, 0))}
              <span style={{ color: 'var(--text-secondary)', fontSize: 14, marginLeft: 8 }}>
                across {locks.length} locks
              </span>
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
              Claimable now:{' '}
              <span className="mono" style={{ color: 'var(--success)', fontWeight: 600 }}>
                {fmtTokenAmount(totalClaimable, 8, { compact: true })}
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
  const { contractHash } = useParams<{ contractHash: string }>();
  const { data: tokenInfo } = useTokenInfo(lock.token);
  const dec = tokenInfo?.decimals ?? 8;
  const sym = tokenInfo?.symbol ? ` ${tokenInfo.symbol}` : '';
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
          {fmtTokenAmount(lock.amount, dec)}{sym}
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
              <span className="mono" style={{ fontWeight: 500 }}>{fmtTokenAmount(claimable, dec, { compact: true })}{sym}</span>
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
            {pendingClaim ? 'Claiming…' : `Claim ${fmtTokenAmount(claimable, dec, { compact: true })}`}
          </button>
        ) : (
          <button className="btn btn-secondary btn-disabled">Not claimable</button>
        )}
        <Link to={`/v/${contractHash}/lock/${lock.id}`} className="btn btn-ghost btn-sm">
          View detail →
        </Link>
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
            {fmtTokenAmount(total)}
            <span style={{ color: 'var(--text-secondary)', fontSize: 14, marginLeft: 8 }}>
              across {locks.length} active · {revoked} revoked
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
  const { contractHash } = useParams<{ contractHash: string }>();
  const { data: tokenInfo } = useTokenInfo(lock.token);
  const dec = tokenInfo?.decimals ?? 8;
  const sym = tokenInfo?.symbol ? ` ${tokenInfo.symbol}` : '';
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
          {fmtTokenAmount(lock.amount, dec)}{sym}
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
        <Link to={`/v/${contractHash}/lock/${lock.id}`} className="btn btn-secondary">
          View detail →
        </Link>
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
  const { contractHash } = useParams<{ contractHash: string }>();
  const conn = useConnection();
  const qc = useQueryClient();
  const { data: owner } = useOwner(contractHash ?? '');

  // Connected wallet as 0x scripthash, for owner comparison.
  const meHash = useMemo(() => {
    if (!conn.address) return undefined;
    if (conn.address.startsWith('0x')) return conn.address.toLowerCase();
    try {
      return '0x' + neonWallet.getScriptHashFromAddress(conn.address);
    } catch {
      return undefined;
    }
  }, [conn.address]);

  const ownerMismatch = !!owner && !!meHash && owner.toLowerCase() !== meHash;

  // Default start = +1 minute (sufficient buffer past the next block).
  const defaultStart = useMemo(() => addSeconds(today, 60), [today]);
  const defaultEnd = useMemo(() => addSeconds(defaultStart, 60 * 60 * 24 * 365), [defaultStart]);

  const [scheduleType, setScheduleType] = useState<ScheduleType>('linear');
  const [revocable, setRevocable] = useState(false);

  // All controlled fields.
  const [tokenInput, setTokenInput] = useState('');
  const [beneficiaryInput, setBeneficiaryInput] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [startInput, setStartInput] = useState(toLocalDatetime(defaultStart));
  const [endInput, setEndInput] = useState(toLocalDatetime(defaultEnd));
  const [cliffInput, setCliffInput] = useState('');
  const [categoryInput, setCategoryInput] = useState<string>('team');
  const [noteInput, setNoteInput] = useState('');
  const [decimals] = useState(8); // assumed; production UI would fetch via NEP-17

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ txHash: string; lockId?: number } | null>(null);

  // Parse + validate.
  const parsed = useMemo(() => parseLockForm({
    tokenInput, beneficiaryInput, amountInput,
    startInput, endInput, cliffInput,
    categoryInput, noteInput,
    scheduleType, revocable, decimals,
  }), [tokenInput, beneficiaryInput, amountInput, startInput, endInput, cliffInput,
       categoryInput, noteInput, scheduleType, revocable, decimals]);

  const previewLock: Lock = useMemo(() => ({
    id: 0,
    cat: categoryInput,
    type: scheduleType,
    start: parsed.ok ? new Date(parsed.startSec * 1000) : defaultStart,
    end:   parsed.ok ? new Date(parsed.endSec * 1000)   : defaultEnd,
    cliff: parsed.ok && parsed.cliffSec ? new Date(parsed.cliffSec * 1000) : undefined,
    amount: parsed.ok ? Number(parsed.amountRaw) : 1_000_000_00,
    rev: revocable,
    ben: beneficiaryInput || '0xA1b3…3Bf2',
    dep: conn.address ?? '',
    label: noteInput,
    claimed: 0,
  } as Lock), [categoryInput, scheduleType, parsed, defaultStart, defaultEnd, revocable, beneficiaryInput, conn.address, noteInput]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!conn.provider || !conn.address) {
      setSubmitError('Connect a wallet first.');
      return;
    }
    if (!contractHash) {
      setSubmitError('No vault hash in URL.');
      return;
    }
    if (!parsed.ok) {
      setSubmitError(parsed.error);
      return;
    }
    setSubmitting(true);
    try {
      const txHash = await createLock(conn.provider, {
        tokenHash: parsed.tokenHash,
        vaultHash: contractHash,
        fromAddress: conn.address,
        beneficiaryHash: parsed.beneficiaryHash,
        amount: parsed.amountRaw,
        scheduleType,
        startTime: parsed.startSec,
        endTime: parsed.endSec,
        cliffTime: parsed.cliffSec ?? 0,
        category: categoryInput,
        note: noteInput,
        revocable,
      });
      const log = await waitForTx(txHash);
      const lockId = extractLockIdFromLog(log);
      // Invalidate dashboards/iterators so the new lock shows up.
      void qc.invalidateQueries({ queryKey: ['allLocks', contractHash] });
      void qc.invalidateQueries({ queryKey: ['lockCount', contractHash] });
      setSuccess({ txHash, lockId });
      setSubmitError(null);
    } catch (e2) {
      setSubmitError(extractMsg(e2));
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="card card-pad" style={{ textAlign: 'center', padding: '40px 24px', maxWidth: 560, margin: '0 auto' }}>
        <div style={{ fontSize: 32, color: 'var(--success)', marginBottom: 8 }}>
          <IconCheck size={36} />
        </div>
        <div className="card-title" style={{ fontSize: 18, marginBottom: 6 }}>Lock created</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
          Tokens have been transferred to the vault and the lock is on-chain.
        </div>
        <div style={{ marginBottom: 20, fontSize: 12, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
          {success.lockId != null && (
            <div style={{ marginBottom: 6 }}>
              Lock ID:{' '}
              <span className="mono" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                #{success.lockId}
              </span>
            </div>
          )}
          <div>
            Tx:{' '}
            <span className="mono" style={{ color: 'var(--text-primary)' }}>
              {success.txHash.slice(0, 10)}…{success.txHash.slice(-8)}
            </span>
            <button
              className="icon-btn"
              style={{ width: 22, height: 22, verticalAlign: 'middle', marginLeft: 4 }}
              aria-label="Copy tx hash"
              onClick={() => navigator.clipboard?.writeText(success.txHash)}
            >
              <IconCopy size={12} />
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button
            className="btn btn-primary"
            onClick={() => {
              setAmountInput('');
              setNoteInput('');
              setSuccess(null);
            }}
          >
            <IconAdd size={13} /> Create another
          </button>
          <Link to={`/v/${contractHash}`} className="btn btn-secondary">
            View on dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <div style={{ marginBottom: 20 }}>
        <div className="card-title" style={{ fontSize: 18, marginBottom: 4 }}>Create a new lock</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 700 }}>
          Only the vault owner can deposit. Tokens are transferred from the connected wallet and locked
          according to the schedule below. One signed transaction.
        </div>
      </div>

      {ownerMismatch && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            background: 'var(--warning-muted)',
            color: 'var(--text-primary)',
            border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)',
            borderRadius: 6,
            fontSize: 12.5,
          }}
        >
          <strong style={{ color: 'var(--warning)' }}>Connected wallet is not the vault owner.</strong>{' '}
          Only <span className="mono">{shortAddr(owner ?? '')}</span> can create locks here. You're
          connected as <span className="mono">{shortAddr(meHash ?? '')}</span>. Switch wallets in
          NeoLine to continue.
        </div>
      )}

      <div className="form-grid">
        <div className="card card-pad form-section">
          <div className="field">
            <label>Token contract</label>
            <input
              className="input mono"
              placeholder="0x… NEP-17 contract hash"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              spellCheck={false}
            />
            <span className="hint">
              Any NEP-17 token. Must be one the wallet holds.{' '}
              {!!parsed.tokenHash && parsed.ok && <span className="ok"><IconCheck size={12} /> Valid</span>}
            </span>
          </div>

          <div className="field">
            <label>Beneficiary</label>
            <input
              className="input mono"
              placeholder="N… (Neo3 address) or 0x… (scripthash)"
              value={beneficiaryInput}
              onChange={(e) => setBeneficiaryInput(e.target.value)}
              spellCheck={false}
            />
          </div>

          <div className="field">
            <label>Amount</label>
            <div className="amount-input">
              <input
                className="input"
                placeholder="1.0"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                inputMode="decimal"
              />
              <span className="sym">{decimals}d</span>
            </div>
            <span className="hint">Amount in whole token units (assumes 8 decimals).</span>
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
                className={'radio-card btn-disabled'}
                title="Stepped vesting requires off-chain tranche serialization — coming soon."
                style={{ cursor: 'not-allowed', opacity: 0.55 }}
              >
                <IconStairs className="ic" size={16} />
                <div className="name">Stepped (soon)</div>
                <div className="desc">Unlock equal tranches at fixed intervals.</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field">
              <label>{scheduleType === 'cliff' ? 'Unlock date' : 'Start date'}</label>
              <input
                className="input mono"
                type="datetime-local"
                min={toLocalDatetime(today)}
                value={startInput}
                onChange={(e) => setStartInput(e.target.value)}
              />
            </div>
            {scheduleType === 'linear' && (
              <div className="field">
                <label>End date</label>
                <input
                  className="input mono"
                  type="datetime-local"
                  min={startInput || toLocalDatetime(today)}
                  value={endInput}
                  onChange={(e) => setEndInput(e.target.value)}
                />
              </div>
            )}
          </div>

          {scheduleType === 'linear' && (
            <div className="field">
              <label>
                Cliff <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                className="input mono"
                type="datetime-local"
                min={startInput || toLocalDatetime(today)}
                max={endInput || undefined}
                value={cliffInput}
                onChange={(e) => setCliffInput(e.target.value)}
              />
              <span className="hint">No tokens vest before this date. Leave empty for none.</span>
            </div>
          )}

          <div className="field">
            <label>Category</label>
            <input
              className="input"
              list="neovest-category-suggestions"
              value={categoryInput}
              onChange={(e) => setCategoryInput(e.target.value.trim().toLowerCase())}
              maxLength={32}
              placeholder="team, investor, treasury, …"
              spellCheck={false}
            />
            <datalist id="neovest-category-suggestions">
              <option value="team" />
              <option value="investor" />
              <option value="treasury" />
              <option value="public" />
              <option value="advisor" />
              <option value="partner" />
            </datalist>
            <span className="hint">
              Free-form. The six built-in categories have themed colors;
              custom names get a stable color from a hash of the string.
            </span>
          </div>

          <div className="field">
            <label>
              Note <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(optional, public)</span>
            </label>
            <input
              className="input"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              maxLength={256}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="hint">Stored on-chain. Visible to everyone.</span>
              <span className="hint mono">{noteInput.length} / 256</span>
            </div>
          </div>

          <div className={'check-row ' + (revocable ? 'on' : '')} onClick={() => setRevocable(!revocable)}>
            <div className="box">{revocable && <IconCheck size={11} />}</div>
            <div>
              <div className="lbl">Allow me to revoke unvested portion</div>
              <div className="desc">Revocable locks are less trustworthy from the beneficiary's perspective.</div>
            </div>
          </div>

          {!parsed.ok && (parsed as { error: string }).error && (amountInput || beneficiaryInput || tokenInput) && (
            <div
              style={{
                padding: '8px 12px', background: 'var(--warning-muted)',
                color: 'var(--warning)', borderRadius: 6, fontSize: 12,
              }}
            >
              {(parsed as { error: string }).error}
            </div>
          )}

          {submitError && (
            <div
              style={{
                padding: '8px 12px', background: 'var(--danger-muted)',
                color: 'var(--danger)', borderRadius: 6, fontSize: 12, wordBreak: 'break-word',
              }}
            >
              {submitError}
            </div>
          )}

          <div className="divider" />

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>One transaction.</strong> Tokens
              transfer to the vault with your lock parameters attached.
            </div>
            <button
              type="submit"
              className={'btn btn-primary btn-lg' + ((!parsed.ok || submitting || ownerMismatch) ? ' btn-disabled' : '')}
              disabled={!parsed.ok || submitting || ownerMismatch}
              title={ownerMismatch ? 'Connected wallet is not the vault owner.' : undefined}
            >
              <IconLock size={14} /> {submitting ? 'Creating…' : 'Create lock'}
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
              <dt>Beneficiary</dt>
              <dd>{beneficiaryInput ? shortAddr(beneficiaryInput) : '—'}</dd>
              <dt>Amount</dt>
              <dd>{amountInput ? `${amountInput}` : '—'}</dd>
              <dt>Type</dt>
              <dd>
                {scheduleType === 'cliff'
                  ? 'Cliff'
                  : (parsed.ok && parsed.cliffSec ? 'Linear with cliff' : 'Linear')}
              </dd>
              <dt>Starts</dt>
              <dd>{parsed.ok ? fmtDate(new Date(parsed.startSec * 1000)) : '—'}</dd>
              {scheduleType === 'linear' && parsed.ok && parsed.cliffSec && (
                <>
                  <dt>Cliff ends</dt>
                  <dd>{fmtDate(new Date(parsed.cliffSec * 1000))}</dd>
                </>
              )}
              <dt>Fully vested</dt>
              <dd>{parsed.ok ? fmtDate(new Date(parsed.endSec * 1000)) : '—'}</dd>
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
                <div className="mono" style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                  shown by wallet
                </div>
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
    </form>
  );
}

// ---------- Create-lock helpers ----------

interface RawLockForm {
  tokenInput: string;
  beneficiaryInput: string;
  amountInput: string;
  startInput: string;
  endInput: string;
  cliffInput: string;
  categoryInput: string;
  noteInput: string;
  scheduleType: ScheduleType;
  revocable: boolean;
  decimals: number;
}

type ParsedLockForm =
  | {
      ok: true;
      tokenHash: string;
      beneficiaryHash: string;
      amountRaw: bigint;
      startSec: number;
      endSec: number;
      cliffSec: number | undefined;
    }
  | { ok: false; error: string; tokenHash?: undefined; beneficiaryHash?: undefined };

function parseLockForm(f: RawLockForm): ParsedLockForm {
  if (f.scheduleType === 'stepped') {
    return { ok: false, error: 'Stepped vesting is not yet supported in the UI form.' };
  }
  if (!f.tokenInput.trim()) return { ok: false, error: 'Token contract hash required.' };
  if (!f.beneficiaryInput.trim()) return { ok: false, error: 'Beneficiary required.' };
  if (!f.amountInput.trim()) return { ok: false, error: 'Amount required.' };

  const tokenHash = normalizeHashOrAddress(f.tokenInput);
  if (!tokenHash) return { ok: false, error: 'Token must be a valid 0x… contract hash.' };
  const beneficiaryHash = normalizeHashOrAddress(f.beneficiaryInput);
  if (!beneficiaryHash) return { ok: false, error: 'Beneficiary must be a valid Neo3 address or 0x scripthash.' };

  const amountRaw = parseAmount(f.amountInput, f.decimals);
  if (amountRaw === null) return { ok: false, error: 'Amount must be a positive number.' };
  if (amountRaw <= 0n) return { ok: false, error: 'Amount must be > 0.' };

  const startSec = parseLocalDatetime(f.startInput);
  if (!startSec) return { ok: false, error: 'Invalid start date.' };
  const nowSec = Math.floor(Date.now() / 1000);

  if (f.scheduleType === 'cliff') {
    if (startSec <= nowSec + 30) return { ok: false, error: 'Cliff date must be at least ~30s in the future.' };
    return { ok: true, tokenHash, beneficiaryHash, amountRaw, startSec, endSec: startSec, cliffSec: undefined };
  }

  // Linear
  if (startSec <= nowSec + 30) return { ok: false, error: 'Start date must be at least ~30s in the future.' };
  const endSec = parseLocalDatetime(f.endInput);
  if (!endSec) return { ok: false, error: 'Invalid end date.' };
  if (endSec <= startSec) return { ok: false, error: 'End must be after start.' };

  let cliffSec: number | undefined;
  if (f.cliffInput.trim()) {
    const c = parseLocalDatetime(f.cliffInput);
    if (!c) return { ok: false, error: 'Invalid cliff date.' };
    if (c < startSec || c > endSec) return { ok: false, error: 'Cliff must be within [start, end].' };
    cliffSec = c;
  }
  return { ok: true, tokenHash, beneficiaryHash, amountRaw, startSec, endSec, cliffSec };
}

/** Accepts a Neo3 address (N…) or 0x-prefixed hex scripthash. Returns 0x-form. */
function normalizeHashOrAddress(s: string): string | null {
  const t = s.trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(t)) return t.toLowerCase();
  if (/^N[A-Za-z0-9]{33}$/.test(t)) {
    try {
      return '0x' + neonWallet.getScriptHashFromAddress(t);
    } catch {
      return null;
    }
  }
  return null;
}

/** Parse a decimal amount (e.g. "1.5") into raw token units (bigint). */
function parseAmount(s: string, decimals: number): bigint | null {
  const t = s.replace(/,/g, '').trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const [whole, frac = ''] = t.split('.');
  if (frac.length > decimals) return null; // too many decimals
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt(fracPadded);
}

/** Convert a `<input type="datetime-local">` value to unix seconds. */
function parseLocalDatetime(s: string): number | null {
  if (!s) return null;
  const ms = new Date(s).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / 1000);
}

function toLocalDatetime(d: Date): string {
  // datetime-local wants `YYYY-MM-DDTHH:mm`; not the ISO Z form.
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function addSeconds(d: Date, s: number): Date {
  return new Date(d.getTime() + s * 1000);
}

function shortAddr(s: string): string {
  if (!s) return '';
  if (s.length <= 14) return s;
  return s.slice(0, 6) + '…' + s.slice(-4);
}

/** Pull the lock id from the contract's `LockCreated` event in an applog. */
function extractLockIdFromLog(log: unknown): number | undefined {
  type Notif = { eventname?: string; state?: { value?: { type?: string; value?: string }[] } };
  type Exec = { notifications?: Notif[] };
  type Log = { executions?: Exec[] };
  const execs = (log as Log)?.executions ?? [];
  for (const e of execs) {
    for (const n of e.notifications ?? []) {
      if (n.eventname !== 'LockCreated') continue;
      const items = n.state?.value;
      if (!items || items.length === 0) continue;
      const v = items[0].value;
      if (v == null) continue;
      const id = Number(v);
      return Number.isFinite(id) ? id : undefined;
    }
  }
  return undefined;
}
