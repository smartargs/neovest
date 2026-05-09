import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { addToHistory } from '@/lib/vault-history';
import {
  CATEGORIES,
  categoryColor,
  categoryName,
  scheduleSummary,
  vestedAt,
  type Lock,
} from '@/lib/data';
import { useAllLocks, useTokenInfo, useTokenInfos } from '@/lib/hooks';
import { useVerification } from '@/lib/verification';
import { fmtDate, fmtRelative, fmtTokenAmount } from '@/lib/format';
import { nextUnlockDate } from '@/lib/vesting-math';
import { StatCard } from '@/components/StatCard';
import { CategoryPill } from '@/components/CategoryPill';
import { ProgressSeg } from '@/components/ProgressSeg';
import { IconCheck, IconChevronRight, IconCopy, IconSearch } from '@/components/icons';
import { VestingTimelineChart, type TimelineRange } from '@/components/charts/VestingTimelineChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { UpcomingBar, type UpcomingBucket } from '@/components/charts/UpcomingBar';

export function Dashboard() {
  const today = useMemo(() => new Date(), []);
  const { contractHash } = useParams<{ contractHash: string }>();
  const navigate = useNavigate();

  // Remember this vault locally so it shows up in "Your vaults" on landing.
  useEffect(() => {
    if (contractHash) addToHistory(contractHash);
  }, [contractHash]);
  const { data: locks, isLoading, error, refetch } = useAllLocks(contractHash ?? '');
  const { data: verification = 'loading' } = useVerification(contractHash ?? '');
  // The hook returns the unified `lib/types.Lock`; structurally identical to
  // the display `lib/data.Lock` so we cast at the boundary instead of
  // refactoring every chart/helper signature.
  const items: Lock[] = (locks ?? []) as unknown as Lock[];

  const [range, setRange] = useState<TimelineRange>('all');
  const [activeCats, setActiveCats] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    CATEGORIES.forEach((c) => (o[c.id] = true));
    return o;
  });

  // Build a timeline of cumulative-vested-by-category over the lock range.
  const timeline = useMemo(() => {
    if (items.length === 0) {
      return { data: emptyTimeline(), minStart: today, maxEnd: today };
    }
    let minStart = new Date(Math.min(...items.map((l) => l.start.getTime())));
    let maxEnd = new Date(Math.max(...items.map((l) => l.end.getTime())));
    // Guard zero-width ranges (a single cliff-style lock with start === end
    // collapses the chart x-axis to a point and produces NaN coordinates).
    // Expand to ±15 days around the point so the step renders meaningfully.
    if (maxEnd.getTime() - minStart.getTime() < 24 * 3600 * 1000) {
      const center = (minStart.getTime() + maxEnd.getTime()) / 2;
      minStart = new Date(center - 15 * 24 * 3600 * 1000);
      maxEnd = new Date(center + 15 * 24 * 3600 * 1000);
    }
    return { data: buildTimelineLocal(items, minStart, maxEnd, 130), minStart, maxEnd };
  }, [items, today]);

  const totalLocked = items.reduce((s, l) => s + l.amount, 0);
  const totalClaimed = items.reduce((s, l) => s + (l.claimed ?? 0), 0);
  const remaining = totalLocked - totalClaimed;
  const uniqueBens = new Set(items.map((l) => l.ben)).size;
  const largest = items.length === 0 ? null : items.reduce<Lock>((a, b) => (a.amount > b.amount ? a : b), items[0]);
  const tokenList = items.map((l) => l.token).filter((t): t is string => !!t);
  const tokenSet = new Set(tokenList);
  const uniqueTokens = tokenSet.size;
  // Per-token metadata (symbol, decimals, totalSupply) for every lock.
  // Each unique token hash spawns one cached RPC trio; lookups are O(1).
  const tokenInfos = useTokenInfos(tokenList);
  // Decimals helper: token-specific when known, fall back to 8.
  const decimalsFor = (hash?: string): number => {
    if (!hash) return 8;
    return tokenInfos[hash]?.decimals ?? 8;
  };
  // Single-token vault → show symbol + % of supply. Multi-token → skip.
  const singleToken = uniqueTokens === 1 ? Array.from(tokenSet)[0] : undefined;
  const { data: tokenInfo } = useTokenInfo(singleToken);
  // Default decimals for aggregate stats: the vault's single token, or 8.
  const aggDecimals = tokenInfo?.decimals ?? 8;
  const pctOfSupply =
    tokenInfo && tokenInfo.totalSupply > 0
      ? ((totalLocked / tokenInfo.totalSupply) * 100).toFixed(2)
      : null;

  // Every category that appears in any of this vault's locks — built-in or
  // custom. Built-ins come first (in their canonical order), then custom
  // categories in lexicographic order.
  const presentCategories = useMemo<string[]>(() => {
    const present = new Set<string>(items.map((l) => String(l.cat)));
    const builtinPresent = CATEGORIES.map((c) => c.id).filter((id) => present.has(id));
    const customPresent = [...present]
      .filter((id) => !CATEGORIES.some((c) => c.id === id))
      .sort();
    return [...builtinPresent, ...customPresent];
  }, [items]);

  const byCat = presentCategories.map((id) => {
    const total = items.filter((l) => l.cat === id).reduce((s, l) => s + l.amount, 0);
    return { id, name: categoryName(id), value: total, color: categoryColor(id) };
  }).filter((c) => c.value > 0);
  const totalForCats = byCat.reduce((s, c) => s + c.value, 0);

  const upcoming = useMemo<UpcomingBucket[]>(() => {
    // Show last 1 week + next 12 weeks so a cliff vested today/recently
    // appears in bucket 0 instead of vanishing.
    const buckets: UpcomingBucket[] = [];
    const weeks = 13;
    const offsetWeeks = -1;
    for (let i = 0; i < weeks; i++) {
      const start = new Date(today.getTime() + (i + offsetWeeks) * 7 * 24 * 3600 * 1000);
      const end = new Date(today.getTime() + (i + offsetWeeks + 1) * 7 * 24 * 3600 * 1000);
      let amt = 0;
      let dom: string | null = null;
      const catTot: Record<string, number> = {};
      items.forEach((l) => {
        const v0 = vestedAt(l, start);
        const v1 = vestedAt(l, end);
        const delta = v1 - v0;
        if (delta > 0) {
          amt += delta;
          catTot[l.cat] = (catTot[l.cat] ?? 0) + delta;
        }
      });
      let max = 0;
      for (const [k, v] of Object.entries(catTot)) {
        if (v > max) {
          max = v;
          dom = k;
        }
      }
      buckets.push({ start, end, amount: amt, color: dom ? categoryColor(dom) : 'var(--text-quaternary)' });
    }
    return buckets;
  }, [today, items]);

  const nextEvents = useMemo(() => {
    const events: { date: Date; amount: number; lock: Lock }[] = [];
    // Include events from the last 24h so a same-day cliff doesn't disappear.
    const cutoff = new Date(today.getTime() - 24 * 3600 * 1000);
    items.forEach((l) => {
      if (l.type === 'cliff') {
        if (l.end > cutoff) events.push({ date: l.end, amount: l.amount, lock: l });
      } else if (l.type === 'linear') {
        if (l.cliff && l.cliff > cutoff) {
          const v = vestedAt(l, l.cliff);
          if (v > 0) events.push({ date: l.cliff, amount: v, lock: l });
        }
        const nextMonth = new Date(today);
        nextMonth.setUTCDate(1);
        nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
        if (nextMonth > l.start && nextMonth < l.end && (!l.cliff || nextMonth >= l.cliff)) {
          const v0 = vestedAt(l, today);
          const v1 = vestedAt(l, nextMonth);
          if (v1 - v0 > 0) events.push({ date: nextMonth, amount: v1 - v0, lock: l });
        }
      } else if (l.type === 'stepped') {
        const steps = l.steps ?? 4;
        const stepDur = (l.end.getTime() - l.start.getTime()) / steps;
        for (let i = 1; i <= steps; i++) {
          const t = new Date(l.start.getTime() + i * stepDur);
          if (t > today) {
            events.push({ date: t, amount: l.amount / steps, lock: l });
            break;
          }
        }
      }
    });
    events.sort((a, b) => a.date.getTime() - b.date.getTime());
    return events.slice(0, 5);
  }, [today, items]);

  // ---- Table search + filter ----
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');

  const sortedLocks = useMemo(() => [...items].sort((a, b) => b.amount - a.amount), [items]);

  const filteredLocks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sortedLocks.filter((l) => {
      if (q) {
        const hay = (l.ben + ' ' + l.label).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterCat !== 'all' && l.cat !== filterCat) return false;
      if (filterType !== 'all' && l.type !== filterType) return false;
      return true;
    });
  }, [sortedLocks, search, filterCat, filterType]);

  function toggleCat(id: string) {
    // Treat unknown ids as active by default (custom categories don't seed
    // the initial state), so the first click toggles them to hidden.
    setActiveCats((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }));
  }

  // ---- Loading / error / empty states ----

  if (isLoading && items.length === 0) {
    return (
      <div data-screen-label="Dashboard">
        <div className="page-header">
          <h1 className="page-title">Vesting Dashboard</h1>
        </div>
        <DashboardSkeleton />
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <div data-screen-label="Dashboard">
        <div className="page-header">
          <h1 className="page-title">Vesting Dashboard</h1>
        </div>
        <div className="card card-pad" style={{ textAlign: 'center', padding: '40px 24px' }}>
          <div style={{ fontSize: 14, color: 'var(--danger)', marginBottom: 8 }}>
            Couldn't load vault data
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 16 }}>
            {error instanceof Error ? error.message : String(error)}
          </div>
          <button className="btn btn-secondary" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!isLoading && items.length === 0) {
    return (
      <div data-screen-label="Dashboard">
        <div className="page-header">
          <div>
            <h1 className="page-title">Vesting Dashboard</h1>
            <div className="page-subtitle">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span className="mono">{shortHash(contractHash ?? '')}</span>
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
              <VerificationBadge status={verification} />
            </div>
          </div>
        </div>
        <div className="card card-pad" style={{ textAlign: 'center', padding: '60px 24px' }}>
          <div style={{ fontSize: 16, color: 'var(--text-primary)', fontWeight: 600, marginBottom: 6 }}>
            This vault has no locks yet.
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
            The owner can create the first lock from the Manage page.
          </div>
          <Link to={`/v/${contractHash}/manage`} className="btn btn-primary">
            Open Manage
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div data-screen-label="Dashboard">
      <div className="page-header">
        <div>
          <h1 className="page-title">Vesting Dashboard</h1>
          <div className="page-subtitle">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span className="mono">{shortHash(contractHash ?? '')}</span>
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
            <VerificationBadge status={verification} />
          </div>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard
          eyebrow="Total locked"
          value={fmtTokenAmount(totalLocked, aggDecimals)}
          unit={tokenInfo?.symbol}
          sub={
            <span>
              {pctOfSupply && (
                <>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{pctOfSupply}%</span>{' '}
                  of supply ·{' '}
                </>
              )}
              {fmtTokenAmount(remaining, aggDecimals, { compact: true })} unclaimed
            </span>
          }
        />
        <StatCard
          eyebrow="Locked positions"
          value={items.length}
          sub={
            <span>
              across <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{CATEGORIES.length}</span>{' '}
              categories · {uniqueTokens || 1} token{uniqueTokens === 1 ? '' : 's'}
            </span>
          }
        />
        <StatCard
          eyebrow="Beneficiaries"
          value={uniqueBens}
          sub={
            <span>
              unique addresses{largest && ' · largest: '}
              <span className="mono" style={{ color: 'var(--text-primary)' }}>
                {largest && fmtTokenAmount(largest.amount, decimalsFor(largest.token), { compact: true })}
              </span>
            </span>
          }
        />
      </div>

      <div className="card card-pad" style={{ marginTop: 24 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Unlock schedule</div>
            <div className="card-subtitle">Cumulative tokens unlocked over time, stacked by category</div>
          </div>
          <div className="pill-group">
            <button className={range === '1y' ? 'active' : ''} onClick={() => setRange('1y')}>1Y</button>
            <button className={range === '3y' ? 'active' : ''} onClick={() => setRange('3y')}>3Y</button>
            <button className={range === 'all' ? 'active' : ''} onClick={() => setRange('all')}>All</button>
          </div>
        </div>

        <div className="chart-wrap" style={{ height: 360 }}>
          <VestingTimelineChart
            width={1180}
            height={360}
            data={timeline.data}
            today={today}
            range={range}
            activeCats={activeCats}
          />
        </div>

        <div className="chart-legend">
          {presentCategories.map((id) => {
            const total = items.filter((l) => l.cat === id).reduce((s, l) => s + l.amount, 0);
            return (
              <div
                key={id}
                className="leg"
                onClick={() => toggleCat(id)}
                style={{ opacity: activeCats[id] === false ? 0.35 : 1 }}
              >
                <span className="swatch" style={{ background: categoryColor(id) }} />
                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{categoryName(id)}</span>
                <span className="amt">{fmtTokenAmount(total, aggDecimals, { compact: true })}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="section-grid" style={{ marginTop: 16 }}>
        <div className="card card-pad">
          <div className="card-header">
            <div>
              <div className="card-title">Allocation by category</div>
              <div className="card-subtitle">Share of locked tokens by group</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 24, alignItems: 'center' }}>
            <div style={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
              <DonutChart size={200} segments={byCat} />
              <div style={{ position: 'absolute', textAlign: 'center' }}>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text-tertiary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: 2,
                  }}
                >
                  Total locked
                </div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: 'var(--text-primary)' }}>
                  {fmtTokenAmount(totalForCats, aggDecimals, { compact: true })}
                </div>
              </div>
            </div>
            <div className="donut-legend">
              {byCat.map((c) => (
                <div key={c.id} className="row">
                  <span className="sw" style={{ background: c.color }} />
                  <span className="nm">{c.name}</span>
                  <span className="am">{fmtTokenAmount(c.value, aggDecimals, { compact: true })}</span>
                  <span className="pc">{((c.value / totalForCats) * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card card-pad">
          <div className="card-header">
            <div>
              <div className="card-title">Upcoming unlocks</div>
              <div className="card-subtitle">Next 90 days, weekly buckets</div>
            </div>
          </div>
          <div className="chart-wrap" style={{ height: 130 }}>
            <UpcomingBar width={540} height={130} buckets={upcoming} />
          </div>
          <div style={{ marginTop: 18 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: 4,
              }}
            >
              Next 5 events
            </div>
            <div className="upcoming-list">
              {nextEvents.map((e, i) => (
                <div key={i} className="row">
                  <span className="dt">
                    {fmtDate(e.date, { short: true })}, {e.date.getUTCFullYear()}
                  </span>
                  <span className="am">
                    {fmtTokenAmount(e.amount, decimalsFor(e.lock.token), { compact: true })}
                  </span>
                  <CategoryPill catId={e.lock.cat} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="table-toolbar">
          <div className="card-title" style={{ marginRight: 'auto' }}>All locks</div>
          <div className="input-search" style={{ maxWidth: 260 }}>
            <IconSearch size={14} />
            <input
              className="input"
              placeholder="Search address or label…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="select" value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
            <option value="all">All categories</option>
            {presentCategories.map((id) => (
              <option key={id} value={id}>{categoryName(id)}</option>
            ))}
          </select>
          <select className="select" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="all">All schedules</option>
            <option value="cliff">Cliff</option>
            <option value="linear">Linear</option>
            <option value="stepped">Stepped</option>
          </select>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
            Showing <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{filteredLocks.length}</span> of {sortedLocks.length}
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Category</th>
                <th>Beneficiary</th>
                <th className="num">Amount</th>
                <th>Schedule</th>
                <th>Vested</th>
                <th>Next</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredLocks.map((l) => {
                const vested = vestedAt(l, today);
                const pct = (vested / l.amount) * 100;
                const next = nextUnlockDate(l, today);
                return (
                  <tr
                    key={l.id}
                    onClick={() => navigate(`/v/${contractHash}/lock/${l.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td><CategoryPill catId={l.cat} /></td>
                    <td>
                      <div className="beneficiary-cell">
                        <span className="addr">{l.ben}</span>
                        <span className="label">{l.label}</span>
                      </div>
                    </td>
                    <td className="num">
                      <div className="amount-cell" style={{ textAlign: 'right' }}>
                        <span className="v">{fmtTokenAmount(l.amount, decimalsFor(l.token))}</span>
                      </div>
                    </td>
                    <td>
                      <div className="schedule-cell">
                        <div className="type">{scheduleSummary(l)}</div>
                        <div className="params">
                          {fmtDate(l.start, { short: true })}, {l.start.getUTCFullYear()} →{' '}
                          {fmtDate(l.end, { short: true })}, {l.end.getUTCFullYear()}
                        </div>
                      </div>
                    </td>
                    <td style={{ minWidth: 130 }}>
                      <div className="vested-cell">
                        <span className="pct">{pct.toFixed(0)}%</span>
                        <ProgressSeg pct={pct} color={categoryColor(l.cat)} segments={10} />
                      </div>
                    </td>
                    <td>
                      <span
                        className="mono"
                        style={{
                          fontSize: 12,
                          color:
                            next && next.getTime() - today.getTime() < 7 * 24 * 3600 * 1000
                              ? 'var(--warning)'
                              : 'var(--text-secondary)',
                        }}
                      >
                        {next ? fmtRelative(next, today) : '—'}
                      </span>
                    </td>
                    <td style={{ width: 30 }}><IconChevronRight size={16} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------- Loading skeleton ----------

function DashboardSkeleton() {
  const bar = (h: number) => (
    <div
      style={{
        height: h,
        background: 'var(--bg-tertiary)',
        borderRadius: 6,
        animation: 'pulse 1.6s ease-in-out infinite',
      }}
    />
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="stat-grid">{bar(96)}{bar(96)}{bar(96)}</div>
      <div className="card card-pad">{bar(280)}</div>
      <div className="section-grid">
        <div className="card card-pad">{bar(180)}</div>
        <div className="card card-pad">{bar(180)}</div>
      </div>
      <style>{`
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.55 } }
      `}</style>
    </div>
  );
}

// ---------- Verification badge ----------

function VerificationBadge({ status }: { status: 'loading' | 'verified' | 'unverified' | 'demo' | 'unknown' }) {
  if (status === 'verified') {
    return (
      <span
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--success)' }}
        title="Deployed bytecode checksum matches the audited source bundled with this UI."
      >
        <IconCheck size={12} /> Verified
      </span>
    );
  }
  if (status === 'unverified') {
    return (
      <span
        style={{ color: 'var(--danger)' }}
        title="Deployed bytecode does NOT match the source this UI was built from. Do not deposit until you understand why."
      >
        Bytecode mismatch
      </span>
    );
  }
  if (status === 'demo') {
    return (
      <span style={{ color: 'var(--text-tertiary)' }} title="Canned demo dataset — not a real on-chain contract.">
        Demo data
      </span>
    );
  }
  if (status === 'unknown') {
    return (
      <span
        style={{ color: 'var(--warning)' }}
        title="Couldn't fetch the contract from the RPC node — verification skipped."
      >
        Unverified
      </span>
    );
  }
  // loading
  return <span style={{ color: 'var(--text-tertiary)' }}>Verifying…</span>;
}

// ---------- Local helpers ----------

function shortHash(s: string): string {
  if (!s) return '';
  if (s.length <= 14) return s;
  return s.slice(0, 6) + '…' + s.slice(-4);
}

type TimelineSeries = Record<string, { t: Date; v: number }[]>;

function emptyTimeline(): TimelineSeries {
  const out: TimelineSeries = {};
  CATEGORIES.forEach((c) => (out[c.id] = [{ t: new Date(), v: 0 }]));
  return out;
}

function buildTimelineLocal(locks: Lock[], start: Date, end: Date, points: number): TimelineSeries {
  const series: TimelineSeries = {};
  CATEGORIES.forEach((c) => (series[c.id] = []));
  const stepMs = (end.getTime() - start.getTime()) / Math.max(1, points - 1);
  for (let i = 0; i < points; i++) {
    const when = new Date(start.getTime() + stepMs * i);
    CATEGORIES.forEach((c) => {
      const total = locks
        .filter((l) => l.cat === c.id)
        .reduce((s, l) => s + vestedAt(l, when), 0);
      series[c.id].push({ t: when, v: total });
    });
  }
  return series;
}
