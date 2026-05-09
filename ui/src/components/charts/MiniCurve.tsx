import { categoryColor, vestedAt } from '@/lib/data';
import type { ScheduleInput } from '@/lib/vesting-math';

interface MiniCurveProps {
  width?: number;
  height?: number;
  lock: ScheduleInput & { cat?: string };
  today?: Date;
}

export function MiniCurve({ width = 280, height = 110, lock, today }: MiniCurveProps) {
  const W = width;
  const H = height;
  const padL = 6;
  const padR = 6;
  const padT = 6;
  const padB = 10;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  if (!lock || !lock.start || !lock.end) return null;
  if (!Number.isFinite(lock.amount) || lock.amount <= 0) return null;

  const t0 = lock.start.getTime();
  const tEnd = lock.end.getTime();
  // Guard zero-duration schedules (cliff schedules where start === end). Pad
  // the time axis so the step renders as a near-vertical jump instead of NaN.
  const t1 = tEnd > t0 ? tEnd : t0 + 1;
  const points = 80;
  const pts: { t: number; v: number }[] = [];
  for (let i = 0; i < points; i++) {
    const t = t0 + ((t1 - t0) * i) / (points - 1);
    const v = vestedAt(lock as never, new Date(t));
    pts.push({ t, v });
  }

  const xS = (t: number) => padL + ((t - t0) / (t1 - t0)) * innerW;
  const yS = (v: number) => padT + innerH - (v / lock.amount) * innerH;

  let d = '';
  pts.forEach((p, i) => {
    d += (i === 0 ? 'M ' : ' L ') + xS(p.t) + ',' + yS(p.v);
  });
  const fill = d + ` L ${padL + innerW},${padT + innerH} L ${padL},${padT + innerH} Z`;
  const c = categoryColor(lock.cat ?? 'team');

  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <path d={fill} fill={c} fillOpacity="0.2" />
      <path d={d} fill="none" stroke={c} strokeWidth="1.5" />
      {today && today.getTime() >= t0 && today.getTime() <= t1 && (
        <line
          x1={xS(today.getTime())}
          y1={padT}
          x2={xS(today.getTime())}
          y2={padT + innerH}
          stroke="var(--text-secondary)"
          strokeDasharray="3 3"
          strokeWidth="1"
          opacity="0.7"
        />
      )}
    </svg>
  );
}
