import type { CSSProperties } from 'react';

interface ProgressSegProps {
  pct: number;
  color: string;
  segments?: number;
}

export function ProgressSeg({ pct, color, segments = 12 }: ProgressSegProps) {
  const filled = Math.round((pct / 100) * segments);
  const segs: boolean[] = [];
  for (let i = 0; i < segments; i++) segs.push(i < filled);
  // CSS variable used by .progress-seg .seg.on { background: var(--seg-color, ...) }
  const style = { '--seg-color': color } as CSSProperties;
  return (
    <div className="progress-seg" style={style}>
      {segs.map((on, i) => <div key={i} className={'seg' + (on ? ' on' : '')} />)}
    </div>
  );
}
