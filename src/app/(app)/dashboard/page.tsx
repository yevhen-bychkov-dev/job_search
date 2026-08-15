import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { requireIdentity } from "@/features/auth/session";
import { StatusChart, TrendChart } from "@/features/dashboard/charts";
import { buildDashboardSummary } from "@/features/dashboard/domain";
import { getAppStore } from "@/lib/data/server-store";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const identity = await requireIdentity();
  const store = getAppStore();
  const [jobs, history] = await Promise.all([
    store.listJobs(identity.userId),
    store.listStatusHistory(identity.userId),
  ]);
  const summary = buildDashboardSummary(jobs, history);
  const metrics = [
    ["Total jobs", summary.metrics.total, "All tracked opportunities"],
    ["Applied", summary.metrics.applied, "Currently marked applied"],
    ["Active", summary.metrics.active, "Applied, screening, or interview"],
    ["Interviews", summary.metrics.interview, "In interview stage"],
    ["Rejected", summary.metrics.rejected, "Current rejected outcomes"],
    ["Offers", summary.metrics.offers, "Current offers"],
  ] as const;
  return (
    <div className="page-stack">
      <PageHeader eyebrow="Overview" title="Dashboard" description="A live view of your pipeline and recent outcomes." action={<Link className="button button-primary" href="/jobs/new">Add job</Link>} />
      <section className="metric-grid" aria-label="Job search summary">
        {metrics.map(([label, value, hint]) => <article className="metric-card" key={label}><span>{label}</span><strong>{value}</strong><p>{hint}</p></article>)}
      </section>
      {jobs.length === 0 ? (
        <section className="empty-state"><span className="empty-icon">＋</span><h2>Start your pipeline</h2><p>Add a job manually or import your Google Sheets CSV to populate the dashboard.</p><div className="button-row"><Link className="button button-primary" href="/jobs/new">Add first job</Link><Link className="button button-secondary" href="/import">Import CSV</Link></div></section>
      ) : (
        <section className="dashboard-grid">
          <article className="card chart-card"><div className="section-heading"><div><p className="eyebrow">Pipeline</p><h2>Jobs by status</h2></div></div><StatusChart data={summary.byStatus} /></article>
          <article className="card chart-card"><div className="section-heading"><div><p className="eyebrow">Momentum</p><h2>Applications over time</h2></div></div><TrendChart data={summary.applicationsOverTime} label="Applications over time" color="#2563eb" /></article>
          <article className="card chart-card"><div className="section-heading"><div><p className="eyebrow">Outcomes</p><h2>Rejections over time</h2></div></div><TrendChart data={summary.rejectionsOverTime} label="Rejections over time" color="#dc2626" /></article>
        </section>
      )}
    </div>
  );
}
