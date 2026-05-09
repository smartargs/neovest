export interface UpcomingBucket {
  start: Date;
  end: Date;
  amount: number;
  color: string;
}

interface UpcomingBarProps {
  width?: number;
  height?: number;
  buckets: UpcomingBucket[];
}

export function UpcomingBar({ width = 540, height = 130, buckets }: UpcomingBarProps) {
  const W = width;
  const H = height;
  const padL = 8;
  const padR = 8;
  const padT = 12;
  const padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const max = Math.max(...buckets.map((b) => b.amount)) || 1;
  const barW = innerW / buckets.length - 4;

  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="var(--border-subtle)" />
      {buckets.map((b, i) => {
        const x = padL + i * (innerW / buckets.length) + 2;
        const h = b.amount > 0 ? Math.max(2, (b.amount / max) * innerH) : 0;
        const y = H - padB - h;
        return <rect key={i} x={x} y={y} width={barW} height={h} fill={b.color} rx="2" />;
      })}
      <text className="axis-label" x={padL} y={H - 4}>Now</text>
      <text className="axis-label" x={W - padR} y={H - 4} textAnchor="end">+90d</text>
    </svg>
  );
}
