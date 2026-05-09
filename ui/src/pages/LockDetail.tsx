import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { categoryColor, scheduleSummary, vestedAt, type Lock } from '@/lib/data';
import { useLock, useTokenInfo } from '@/lib/hooks';
import { fmtDate, fmtTokenAmount } from '@/lib/format';
import { CategoryPill } from '@/components/CategoryPill';
import { ProgressSeg } from '@/components/ProgressSeg';
import { MiniCurve } from '@/components/charts/MiniCurve';
import { IconChevronRight } from '@/components/icons';

export function LockDetail() {
  const { lockId, contractHash } = useParams<{ lockId: string; contractHash: string }>();
  const lockIdNum = lockId ? parseInt(lockId, 10) : undefined;
  const { data: rawLock, isLoading } = useLock(contractHash ?? '', lockIdNum);
  // Cast at the boundary — types.Lock from the hook is structurally
  // identical to the display Lock the components were written against.
  const lock = (rawLock ?? null) as unknown as Lock | null;
  const today = useMemo(() => new Date(), []);
  const { data: tokenInfo } = useTokenInfo(lock?.token);
  const tokenDec = tokenInfo?.decimals ?? 8;
  const tokenSym = tokenInfo?.symbol;

  if (isLoading && !lock) {
    return (
      <div>
        <div className="page-header"><h1 className="page-title">Loading lock…</h1></div>
      </div>
    );
  }

  if (!lock) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">Lock not found</h1>
        </div>
        <Link to={`/v/${contractHash}`} className="btn btn-secondary">← Back to dashboard</Link>
      </div>
    );
  }

  const vested = vestedAt(lock, today);
  const claimable = Math.max(0, vested - (lock.claimed ?? 0));
  const pct = (vested / lock.amount) * 100;

  return (
    <div>
      <div className="page-header">
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Link to={`/v/${contractHash}`} style={{ color: 'inherit', textDecoration: 'none' }}>Dashboard</Link>
            <IconChevronRight size={12} />
            <span>Lock #{lock.id}</span>
          </div>
          <h1 className="page-title">{lock.label}</h1>
          <div className="page-subtitle">
            <CategoryPill catId={lock.cat} />
            <span className="sep">·</span>
            <span>To <span className="mono" style={{ color: 'var(--text-primary)' }}>{lock.ben}</span></span>
            <span className="sep">·</span>
            <span>From <span className="mono" style={{ color: 'var(--text-primary)' }}>{lock.dep}</span></span>
          </div>
        </div>
      </div>

      <div className="section-grid">
        <div className="card card-pad">
          <div className="card-header">
            <div>
              <div className="card-title">Schedule</div>
              <div className="card-subtitle">{scheduleSummary(lock)}</div>
            </div>
          </div>
          <div className="chart-wrap" style={{ height: 200, background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', borderRadius: 6 }}>
            <MiniCurve width={520} height={200} lock={lock} today={today} />
          </div>
          <dl className="dl" style={{ marginTop: 16 }}>
            <dt>Token</dt>
            <dd className="mono">
              {tokenSym ? <strong>{tokenSym}</strong> : null}{' '}
              {lock.token ? shortHash(lock.token) : '—'}
            </dd>
            <dt>Total amount</dt><dd>{fmtTokenAmount(lock.amount, tokenDec)}{tokenSym ? ` ${tokenSym}` : ''}</dd>
            <dt>Vested today</dt><dd>{fmtTokenAmount(vested, tokenDec)} ({pct.toFixed(1)}%)</dd>
            <dt>Claimed</dt><dd>{fmtTokenAmount(lock.claimed ?? 0, tokenDec)}</dd>
            <dt>Claimable</dt>
            <dd style={{ color: claimable > 0 ? 'var(--success)' : 'var(--text-primary)' }}>
              {fmtTokenAmount(claimable, tokenDec)}
            </dd>
            <dt>Starts</dt><dd>{fmtDate(lock.start)}</dd>
            {lock.cliff && (<><dt>Cliff</dt><dd>{fmtDate(lock.cliff)}</dd></>)}
            <dt>Fully vested</dt><dd>{fmtDate(lock.end)}</dd>
            <dt>Revocable</dt><dd>{lock.rev ? 'Yes' : 'No'}</dd>
          </dl>
        </div>

        <div className="card card-pad">
          <div className="card-header">
            <div>
              <div className="card-title">Progress</div>
              <div className="card-subtitle">Vesting at today's date</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="mono" style={{ fontSize: 22, color: 'var(--text-primary)' }}>
              {pct.toFixed(0)}%
            </span>
            <div style={{ flex: 1 }}>
              <ProgressSeg pct={pct} color={categoryColor(lock.cat)} segments={20} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function shortHash(s: string): string {
  if (!s) return '';
  if (s.length <= 14) return s;
  return s.slice(0, 6) + '…' + s.slice(-4);
}
