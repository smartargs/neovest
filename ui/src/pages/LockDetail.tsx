import { useParams, Link } from 'react-router-dom';
import { categoryColor, scheduleSummary, type Lock } from '@/lib/data';
import { useLock, useTokenInfo, useVested, useClaimable, useNow } from '@/lib/hooks';
import { fmtDateTime, fmtTokenAmount } from '@/lib/format';
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
  const today = useNow();
  const { data: tokenInfo } = useTokenInfo(lock?.token);
  const tokenDec = tokenInfo?.decimals;
  const tokenSym = tokenInfo?.symbol;
  const { data: vested = 0 } = useVested(contractHash ?? '', lockIdNum);
  const { data: claimable = 0 } = useClaimable(contractHash ?? '', lockIdNum);

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

  const pct = lock.amount > 0 ? (vested / lock.amount) * 100 : 0;
  const claimedPct = lock.amount > 0 ? ((lock.claimed ?? 0) / lock.amount) * 100 : 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Link to={`/v/${contractHash}`} style={{ color: 'inherit', textDecoration: 'none' }}>Dashboard</Link>
            <IconChevronRight size={12} />
            <span>Lock #{lock.id}</span>
          </div>
          <h1 className="page-title">{lock.label || `Lock #${lock.id}`}</h1>
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
            {lock.revoked ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, textAlign: 'center', padding: '0 24px' }}>
                <span className="lock-tag-revoked">Revoked</span>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 380 }}>
                  Vesting was stopped and the unvested balance returned to the depositor.
                  The beneficiary keeps the {fmtTokenAmount(lock.amount, tokenDec)}{tokenSym ? ` ${tokenSym}` : ''} that had vested at that point.
                </div>
              </div>
            ) : (
              <MiniCurve width={520} height={200} lock={lock} today={today} />
            )}
          </div>
          <dl className="dl" style={{ marginTop: 16 }}>
            <dt>Token</dt>
            <dd className="mono">
              {tokenSym ? <strong>{tokenSym}</strong> : null}{' '}
              {lock.token ? shortHash(lock.token) : '—'}
            </dd>
            <dt>Total amount</dt><dd>{fmtTokenAmount(lock.amount, tokenDec)}{tokenSym ? ` ${tokenSym}` : ''}</dd>
            <dt>Vested today</dt><dd>{fmtTokenAmount(vested, tokenDec)} ({pct.toFixed(1)}%)</dd>
            <dt>Claimed</dt><dd>{fmtTokenAmount(lock.claimed ?? 0, tokenDec)} ({lock.amount > 0 ? (((lock.claimed ?? 0) / lock.amount) * 100).toFixed(1) : '0'}%)</dd>
            <dt>Claimable</dt>
            <dd style={{ color: claimable > 0 ? 'var(--success)' : 'var(--text-primary)' }}>
              {fmtTokenAmount(claimable, tokenDec)}
            </dd>
            <dt>Starts</dt><dd>{fmtDateTime(lock.start)}</dd>
            {lock.cliff && (<><dt>Cliff</dt><dd>{fmtDateTime(lock.cliff)}</dd></>)}
            <dt>Fully vested</dt><dd>{fmtDateTime(lock.end)}</dd>
            <dt>Revocable</dt><dd>{lock.rev ? 'Yes' : 'No'}</dd>
            {lock.revoked && (<><dt>Status</dt><dd style={{ color: 'var(--danger)' }}>Revoked</dd></>)}
          </dl>
        </div>

        <div className="card card-pad">
          <div className="card-header">
            <div>
              <div className="card-title">Progress</div>
              <div className="card-subtitle">Vested vs claimed, at today's date</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                <span>Vested</span>
                <span className="mono" style={{ color: 'var(--text-primary)' }}>{pct.toFixed(1)}%</span>
              </div>
              <ProgressSeg pct={pct} color={categoryColor(lock.cat)} segments={20} />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                <span>Claimed</span>
                <span className="mono" style={{ color: 'var(--text-primary)' }}>{claimedPct.toFixed(1)}%</span>
              </div>
              <ProgressSeg pct={claimedPct} color="var(--success)" segments={20} />
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
