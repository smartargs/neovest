import type { ReactNode } from 'react';

interface StatCardProps {
  eyebrow: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  sub?: ReactNode;
}

export function StatCard({ eyebrow, value, unit, sub }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-eyebrow">{eyebrow}</div>
      <div>
        <span className="stat-value mono">{value}</span>
        {unit && <span className="stat-unit">{unit}</span>}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}
