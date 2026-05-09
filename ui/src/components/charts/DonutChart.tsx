interface Segment {
  id: string;
  name: string;
  value: number;
  color: string;
  dim?: boolean;
}

interface DonutChartProps {
  size?: number;
  segments: Segment[];
}

export function DonutChart({ size = 200, segments }: DonutChartProps) {
  const r = size / 2;
  const innerR = r * 0.62;
  const total = segments.reduce((s, x) => s + x.value, 0);
  let acc = 0;

  function arc(cx: number, cy: number, R: number, a0: number, a1: number) {
    const x0 = cx + R * Math.cos(a0);
    const y0 = cy + R * Math.sin(a0);
    const x1 = cx + R * Math.cos(a1);
    const y1 = cy + R * Math.sin(a1);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return { x0, y0, x1, y1, large };
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {segments.map((s, i) => {
        const start = (acc / total) * Math.PI * 2 - Math.PI / 2;
        acc += s.value;
        const end = (acc / total) * Math.PI * 2 - Math.PI / 2;
        const a = arc(r, r, r - 2, start, end);
        const b = arc(r, r, innerR, end, start);
        const d = `M ${a.x0} ${a.y0} A ${r - 2} ${r - 2} 0 ${a.large} 1 ${a.x1} ${a.y1} L ${b.x0} ${b.y0} A ${innerR} ${innerR} 0 ${a.large} 0 ${b.x1} ${b.y1} Z`;
        return <path key={i} d={d} fill={s.color} opacity={s.dim ? 0.25 : 1} />;
      })}
    </svg>
  );
}

export type { Segment as DonutSegment };
