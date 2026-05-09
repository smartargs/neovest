import { useMemo, useState } from 'react';
import {
  CATEGORIES,
  CONTRACT,
  LOCKS,
  TODAY,
  TOKEN,
  buildTimeline,
  categoryColor,
  scheduleSummary,
  vestedAt,
  type Lock,
} from '@/lib/data';
import { fmtDate, fmtNum, fmtRelative } from '@/lib/format';
import { nextUnlockDate } from '@/lib/vesting-math';
import { StatCard } from '@/components/StatCard';
import { CategoryPill } from '@/components/CategoryPill';
import { ProgressSeg } from '@/components/ProgressSeg';
import { IconCheck, IconChevronDown, IconChevronRight, IconCopy, IconSearch } from '@/components/icons';
import { VestingTimelineChart, type TimelineRange } from '@/components/charts/VestingTimelineChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { UpcomingBar, type UpcomingBucket } from '@/components/charts/UpcomingBar';

export function Dashboard() {
  const today = TODAY;

  const [range, setRange] = useState<TimelineRange>('all');
  const [activeCats, setActiveCats] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    CATEGORIES.forEach((c) => (o[c.id] = true));
    return o;
  });

  const timeline = useMemo(() => {
    const minStart = new Date(Math.min(...LOCKS.map((l) => l.start.getTime())));
    const maxEnd = new Date(Math.max(...LOCKS.map((l) => l.end.getTime())));
    return { data: buildTimeline(minStart, maxEnd, 130), minStart, maxEnd };
  }, []);

  const totalLocked = LOCKS.reduce((s, l) => s + l.amount, 0);
  const totalClaimed = LOCKS.reduce((s, l) => s + (l.claimed ?? 0), 0);
  const remaining = totalLocked - totalClaimed;
  const pctOfSupply = ((totalLocked / TOKEN.totalSupply) * 100).toFixed(1);
  const uniqueBens = new Set(LOCKS.map((l) => l.ben)).size;
  const largest = LOCKS.reduce<Lock>((a, b) => (a.amount > b.amount ? a : b), LOCKS[0]);

  const byCat = CATEGORIES.map((c) => {
    const total = LOCKS.filter((l) => l.cat === c.id).reduce((s, l) => s + l.amount, 0);
    return { id: c.id, name: c.name, value: total, color: categoryColor(c.id) };
  }).filter((c) => c.value > 0);
  const totalForCats = byCat.reduce((s, c) => s + c.value, 0);

  const upcoming = useMemo<UpcomingBucket[]>(() => {
    const buckets: UpcomingBucket[] = [];
    const weeks = 13;
    for (let i = 0; i < weeks; i++) {
      const start = new Date(today.getTime() + i * 7 * 24 * 3600 * 1000);
      const end = new Date(today.getTime() + (i + 1) * 7 * 24 * 3600 * 1000);
      let amt = 0;
      let dom: string | null = null;
      const catTot: Record<string, number> = {};
      LOCKS.forEach((l) => {
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
  }, [today]);

  const nextEvents = useMemo(() => {
    const events: { date: Date; amount: number; lock: Lock }[] = [];
    LOCKS.forEach((l) => {
      if (l.type === 'cliff') {
        if (l.end > today) events.push({ date: l.end, amount: l.amount, lock: l });
      } else if (l.type === 'linear') {
        if (l.cliff && l.cliff > today) {
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
  }, [today]);

  const sortedLocks = [...LOCKS].sort((a, b) => b.amount - a.amount);

  function toggleCat(id: string) {
    setActiveCats((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div data-screen-label="Dashboard">
      <div className="page-header">
        <div>
          <h1 className="page-title">Vesting Dashboard</h1>
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
            <span>Mainnet</span>
            <span className="sep">·</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--success)' }}>
              <IconCheck size={12} /> Verified
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="token-selector">
            <span className="token-logo">L</span>
            <div>
              <div className="name">
                Lattice <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>(LTC)</span>
              </div>
              <div className="total mono">{fmtNum(TOKEN.totalSupply, { compact: true })} supply</div>
            </div>
            <IconChevronDown />
          </div>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard
          eyebrow="Total locked"
          value={fmtNum(totalLocked)}
          unit="LTC"
          sub={
            <span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{pctOfSupply}%</span> of supply ·{' '}
              {fmtNum(remaining, { compact: true })} unclaimed
            </span>
          }
        />
        <StatCard
          eyebrow="Locked positions"
          value={LOCKS.length}
          sub={
            <span>
              across <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{CATEGORIES.length}</span>{' '}
              categories · 1 token
            </span>
          }
        />
        <StatCard
          eyebrow="Beneficiaries"
          value={uniqueBens}
          sub={
            <span>
              unique addresses · largest:{' '}
              <span className="mono" style={{ color: 'var(--text-primary)' }}>
                {fmtNum(largest.amount, { compact: true })} LTC
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
          <div className="chart-tip" style={{ left: '54%', top: 36 }}>
            <div className="dt">Mar 15, 2027</div>
            {CATEGORIES.filter((c) => activeCats[c.id])
              .slice(0, 5)
              .map((c) => {
                const series = timeline.data[c.id];
                const idx = Math.floor(series.length * 0.42);
                return (
                  <div key={c.id} className="row">
                    <span className="sw" style={{ background: categoryColor(c.id) }} />
                    <span className="nm">{c.name}</span>
                    <span className="am">{fmtNum(series[idx].v, { compact: true })}</span>
                  </div>
                );
              })}
          </div>
        </div>

        <div className="chart-legend">
          {CATEGORIES.map((c) => {
            const total = LOCKS.filter((l) => l.cat === c.id).reduce((s, l) => s + l.amount, 0);
            return (
              <div
                key={c.id}
                className="leg"
                onClick={() => toggleCat(c.id)}
                style={{ opacity: activeCats[c.id] ? 1 : 0.35 }}
              >
                <span className="swatch" style={{ background: categoryColor(c.id) }} />
                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{c.name}</span>
                <span className="amt">{fmtNum(total, { compact: true })}</span>
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
                  {fmtNum(totalForCats, { compact: true })}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 1 }}>LTC</div>
              </div>
            </div>
            <div className="donut-legend">
              {byCat.map((c) => (
                <div key={c.id} className="row">
                  <span className="sw" style={{ background: c.color }} />
                  <span className="nm">{c.name}</span>
                  <span className="am">{fmtNum(c.value, { compact: true })}</span>
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
                    {fmtNum(e.amount, { compact: true })} <span style={{ color: 'var(--text-secondary)' }}>LTC</span>
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
            <input className="input" placeholder="Search address or label…" />
          </div>
          <select className="select"><option>All categories</option></select>
          <select className="select"><option>All schedules</option></select>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
            Showing <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{sortedLocks.length}</span> of {sortedLocks.length}
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
              {sortedLocks.map((l) => {
                const vested = vestedAt(l, today);
                const pct = (vested / l.amount) * 100;
                const next = nextUnlockDate(l, today);
                return (
                  <tr key={l.id}>
                    <td><CategoryPill catId={l.cat} /></td>
                    <td>
                      <div className="beneficiary-cell">
                        <span className="addr">{l.ben}</span>
                        <span className="label">{l.label}</span>
                      </div>
                    </td>
                    <td className="num">
                      <div className="amount-cell" style={{ textAlign: 'right' }}>
                        <span className="v">{fmtNum(l.amount)}</span>
                        <span className="sym">LTC</span>
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
