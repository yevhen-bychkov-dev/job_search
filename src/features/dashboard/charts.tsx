import { useId } from "react";

import { JOB_STATUS_LABELS, type JobStatus } from "@/features/jobs/types";

import type { DashboardSummary } from "./domain";

const STATUS_COLORS: Record<JobStatus, string> = {
  new: "#3563ff",
  saved: "#8954f5",
  applied: "#28a3c4",
  screening: "#fc8b34",
  interview: "#20aa58",
  offer: "#efb622",
  rejected: "#ef4c91",
  withdrawn: "#92a1b9",
};

export function StatusChart({ data }: { data: DashboardSummary["byStatus"] }) {
  const id = useId();
  const total = data.reduce((sum, item) => sum + item.count, 0);
  return (
    <div role="img" aria-label="Jobs by status" aria-describedby={id}>
      <p className="sr-only" id={id}>{data.map((item) => `${JOB_STATUS_LABELS[item.status]}: ${item.count} jobs (${total ? Math.round(item.count / total * 100) : 0}%)`).join("; ")}.</p>
      <ul className="dashboard-status-chart" aria-hidden="true">
      {data.map((item) => {
        const percentage = total ? (item.count / total) * 100 : 0;
        return (
          <li className="dashboard-status-row" key={item.status}>
            <span className="dashboard-status-label">
              <span className="dashboard-status-dot" style={{ background: STATUS_COLORS[item.status] }} aria-hidden="true" />
              {JOB_STATUS_LABELS[item.status]}
            </span>
            <span className="dashboard-status-track" aria-hidden="true">
              <span style={{ width: `${percentage}%`, background: STATUS_COLORS[item.status] }} />
            </span>
            <strong>{item.count}</strong>
            <span className="dashboard-status-percentage">{Math.round(percentage)}%</span>
          </li>
        );
      })}
      </ul>
    </div>
  );
}

function formatMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, monthNumber - 1, 1)));
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
  const id = useId();
  if (!data.length) {
    return <div className="dashboard-chart-empty"><p>No dated activity yet.</p><span>Your monthly activity will appear here.</span></div>;
  }

  const max = Math.max(1, ...data.map((item) => item.count));
  const step = Math.max(1, Math.ceil(max / 4));
  const axisMax = step * 4;
  const width = 1000;
  const height = 210;
  const points = data.map((item, index) => ({
    ...item,
    x: data.length === 1 ? width / 2 : (index / (data.length - 1)) * width,
    y: height - (item.count / axisMax) * height,
    formattedMonth: formatMonth(item.month),
  }));
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${points[0].x},${height} ${line} ${points[points.length - 1].x},${height}`;

  return (
    <div className="dashboard-trend-scroll" tabIndex={data.length > 4 ? 0 : undefined} role="region" aria-label={`${label} chart`}>
      <div className="dashboard-trend-layout" style={{ minWidth: data.length > 4 ? `${data.length * 76}px` : undefined }}>
        <div className="dashboard-chart-yaxis" aria-hidden="true">
          {[4, 3, 2, 1, 0].map((tick) => <span key={tick} style={{ top: `${(1 - tick / 4) * 100}%` }}>{tick * step}</span>)}
        </div>
        <div className="dashboard-chart-main">
          <div className="dashboard-chart-plot">
            <svg className="dashboard-trend-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}>
              <title id={`${id}-title`}>{label}</title>
              <desc id={`${id}-description`}>{points.map((point) => `${point.formattedMonth}: ${point.count}`).join("; ")}. Monthly totals.</desc>
              <defs>
                <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity=".2" />
                  <stop offset="100%" stopColor={color} stopOpacity=".025" />
                </linearGradient>
              </defs>
              {[0, 1, 2, 3, 4].map((tick) => <line key={tick} x1="0" x2={width} y1={(tick / 4) * height} y2={(tick / 4) * height} className="dashboard-chart-gridline" vectorEffect="non-scaling-stroke" />)}
              {points.map((point) => <line key={point.month} x1={point.x} x2={point.x} y1="0" y2={height} className="dashboard-chart-gridline dashboard-chart-vertical" vectorEffect="non-scaling-stroke" />)}
              {points.length > 1 ? <polygon points={area} fill={`url(#${id}-fill)`} /> : null}
              <polyline fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={line} vectorEffect="non-scaling-stroke" />
            </svg>
            {points.map((point) => <span key={point.month} className="dashboard-chart-point" style={{ left: `${point.x / width * 100}%`, top: `${point.y / height * 100}%`, background: color }} title={`${point.formattedMonth}: ${point.count}`} aria-hidden="true" />)}
          </div>
          <div className="dashboard-chart-xaxis" aria-hidden="true">
            {points.map((point, index) => (
              <span key={point.month} className={points.length === 1 ? undefined : index === 0 ? "dashboard-axis-first" : index === points.length - 1 ? "dashboard-axis-last" : undefined} style={{ left: `${point.x / width * 100}%` }}>
                {point.formattedMonth}<strong>{point.count}</strong>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
