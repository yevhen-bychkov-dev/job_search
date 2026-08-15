import { JOB_STATUS_LABELS } from "@/features/jobs/types";

import type { DashboardSummary } from "./domain";

const COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#d97706", "#059669", "#dc2626", "#db2777", "#64748b"];

export function StatusChart({ data }: { data: DashboardSummary["byStatus"] }) {
  const max = Math.max(1, ...data.map((item) => item.count));
  return (
    <div className="bar-chart" role="img" aria-label="Jobs by status">
      {data.map((item, index) => (
        <div className="bar-row" key={item.status}>
          <span>{JOB_STATUS_LABELS[item.status]}</span>
          <div className="bar-track"><span style={{ width: `${(item.count / max) * 100}%`, background: COLORS[index] }} /></div>
          <strong>{item.count}</strong>
        </div>
      ))}
    </div>
  );
}

export function TrendChart({
  data,
  label,
  color,
}: {
  data: Array<{ month: string; count: number }>;
  label: string;
  color: string;
}) {
  if (!data.length) return <div className="chart-empty">No dated activity yet.</div>;
  const max = Math.max(1, ...data.map((item) => item.count));
  const width = 420;
  const height = 150;
  const points = data.map((item, index) => {
    const x = data.length === 1 ? width / 2 : 18 + (index / (data.length - 1)) * (width - 36);
    const y = height - 22 - (item.count / max) * (height - 44);
    return { ...item, x, y };
  });
  return (
    <div className="trend-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        <polyline fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" points={points.map((point) => `${point.x},${point.y}`).join(" ")} />
        {points.map((point) => <circle key={point.month} cx={point.x} cy={point.y} r="5" fill={color}><title>{point.month}: {point.count}</title></circle>)}
      </svg>
      <div className="trend-labels">{points.map((point) => <span key={point.month}>{point.month}<strong>{point.count}</strong></span>)}</div>
    </div>
  );
}
