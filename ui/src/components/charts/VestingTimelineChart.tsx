import { CATEGORIES, categoryColor } from '@/lib/data';
import type { TimelineSeries } from '@/lib/data';
import { fmtNum } from '@/lib/format';

export type TimelineRange = '1y' | '3y' | 'all';

interface VestingTimelineChartProps {
  width?: number;
  height?: number;
  data: TimelineSeries;
  today: Date;
  range: TimelineRange;
  activeCats: Record<string, boolean>;
}

/**
 * Stacked, smoothly-interpolated area chart of cumulative vested supply by
 * category, with a "today" marker and year ticks. Hand-rolled SVG —
 * Recharts could replace this once visual parity is no longer required.
 */
export function VestingTimelineChart({
  width = 1180,
  height = 360,
  data,
  today,
  range,
  activeCats,
}: VestingTimelineChartProps) {
  const W = width;
  const H = height;
  const padL = 56;
  const padR = 24;
  const padT = 16;
  const padB = 36;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const cats = CATEGORIES;
  const visibleCats = cats.filter((c) => activeCats[c.id]);

  const series0 = data[cats[0].id];
  const points = series0.length;
  const t0 = series0[0].t.getTime();
  const tN = series0[points - 1].t.getTime();

  let rangeStart = t0;
  let rangeEnd = tN;
  if (range === '1y') {
    rangeStart = today.getTime();
    rangeEnd = today.getTime() + 365 * 24 * 3600 * 1000;
  }
  if (range === '3y') {
    rangeStart = today.getTime() - 180 * 24 * 3600 * 1000;
    rangeEnd = today.getTime() + 3 * 365 * 24 * 3600 * 1000;
  }
  rangeStart = Math.max(rangeStart, t0);
  rangeEnd = Math.min(rangeEnd, tN);
  // Guard zero-width ranges so xScale doesn't divide by zero. Caller usually
  // pads the range upstream; this is belt-and-suspenders.
  if (rangeEnd <= rangeStart) rangeEnd = rangeStart + 1;

  const stacked = series0.map((_, i) => {
    let acc = 0;
    const layers: Record<string, { y0: number; y1: number }> = {};
    for (const c of cats) {
      if (activeCats[c.id]) {
        layers[c.id] = { y0: acc, y1: acc + data[c.id][i].v };
        acc += data[c.id][i].v;
      } else {
        layers[c.id] = { y0: acc, y1: acc };
      }
    }
    return { t: series0[i].t.getTime(), layers, total: acc };
  });

  const yMax = Math.max(...stacked.map((p) => p.total)) || 1;

  const xScale = (t: number) => padL + ((t - rangeStart) / (rangeEnd - rangeStart)) * innerW;
  const yScale = (v: number) => padT + innerH - (v / yMax) * innerH;

  function smoothPath(pts: { x: number; y: number }[]): string {
    if (pts.length < 2) return '';
    let d = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1];
      const p1 = pts[i];
      const cx = (p0.x + p1.x) / 2;
      d += ` C ${cx},${p0.y} ${cx},${p1.y} ${p1.x},${p1.y}`;
    }
    return d;
  }

  const inRange = stacked.filter((p) => p.t >= rangeStart - 1 && p.t <= rangeEnd + 1);

  const yTicks: number[] = [];
  const tickCount = 4;
  for (let i = 0; i <= tickCount; i++) yTicks.push((yMax * i) / tickCount);

  const startD = new Date(rangeStart);
  const endD = new Date(rangeEnd);
  const xTicks: { t: number; label: string }[] = [];
  for (let y = startD.getUTCFullYear(); y <= endD.getUTCFullYear(); y++) {
    const t = Date.UTC(y, 0, 1);
    if (t >= rangeStart && t <= rangeEnd) xTicks.push({ t, label: String(y) });
  }

  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {yTicks.map((v, i) => (
        <g key={'yt-' + i}>
          <line className="grid-line" x1={padL} y1={yScale(v)} x2={W - padR} y2={yScale(v)} />
          <text className="axis-label" x={padL - 10} y={yScale(v) + 3} textAnchor="end">
            {v === 0 ? '0' : fmtNum(v, { compact: true })}
          </text>
        </g>
      ))}

      {xTicks.map((tk, i) => (
        <text key={'xt-' + i} className="axis-label" x={xScale(tk.t)} y={H - padB + 18} textAnchor="middle">
          {tk.label}
        </text>
      ))}

      {[...visibleCats].reverse().map((c) => {
        const top = inRange.map((p) => ({ x: xScale(p.t), y: yScale(p.layers[c.id].y1) }));
        const bot = inRange.map((p) => ({ x: xScale(p.t), y: yScale(p.layers[c.id].y0) }));
        const topPath = smoothPath(top);
        const botPath = smoothPath([...bot].reverse());
        const fillPath =
          topPath +
          ' L ' +
          bot[bot.length - 1].x +
          ',' +
          bot[bot.length - 1].y +
          ' ' +
          botPath.slice(1) +
          ' Z';
        return (
          <g key={c.id}>
            <path d={fillPath} fill={categoryColor(c.id)} fillOpacity="var(--chart-fill-opacity)" />
            <path d={topPath} fill="none" stroke={categoryColor(c.id)} strokeWidth="1.5" />
          </g>
        );
      })}

      {today.getTime() >= rangeStart && today.getTime() <= rangeEnd && (
        <g>
          <line
            className="today-line"
            x1={xScale(today.getTime())}
            y1={padT}
            x2={xScale(today.getTime())}
            y2={H - padB}
          />
          <text
            className="axis-label"
            x={xScale(today.getTime())}
            y={padT - 4}
            textAnchor="middle"
            fill="var(--text-secondary)"
          >
            Today
          </text>
        </g>
      )}

      <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="var(--border-subtle)" strokeWidth="1" />
    </svg>
  );
}
