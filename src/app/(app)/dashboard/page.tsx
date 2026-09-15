import type { Metadata } from "next";
import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { requireIdentity } from "@/features/auth/session";
import { StatusChart, TrendChart } from "@/features/dashboard/charts";
import { buildDashboardSummary } from "@/features/dashboard/domain";
import { getAppStore } from "@/lib/data/server-store";

import "@/features/dashboard/dashboard.css";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const identity = await requireIdentity();
  const store = getAppStore();
  const [jobs, history] = await Promise.all([
    store.listJobs(identity.userId),
    store.listStatusHistory(identity.userId),
  ]);
  const activeJobIds = new Set(jobs.map((job) => job.id));
  const summary = buildDashboardSummary(jobs, history.filter((event) => activeJobIds.has(event.jobId)));
  const metrics = [
    ["Total jobs", summary.metrics.total, "All tracked opportunities", "document", "blue"],
    ["Applied", summary.metrics.applied, "Currently marked applied", "send", "purple"],
    ["Active", summary.metrics.active, "Applied, screening, or interview", "clock", "cyan"],
    ["Interviews", summary.metrics.interview, "In interview stage", "users", "orange"],
    ["Rejected", summary.metrics.rejected, "Current rejected outcomes", "close", "pink"],
    ["Offers", summary.metrics.offers, "Current offers", "trophy", "green"],
  ] as const;
  return (
    <div className="page-stack dashboard-page">
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="A live view of your pipeline and recent outcomes."
        action={
          <div className="dashboard-header-actions">
            <span className="dashboard-period"><Icon name="calendar" size={18} />All time</span>
            <Link className="button button-primary" href="/jobs/new"><Icon name="plus" size={19} />Add job</Link>
          </div>
        }
      />
      <section className="dashboard-metrics" aria-label="Job search summary">
        {metrics.map(([label, value, hint, icon, color]) => (
          <article className={`dashboard-metric dashboard-metric-${color}`} key={label}>
            <div className="dashboard-metric-heading">
              <span className="dashboard-metric-icon"><Icon name={icon} size={23} /></span>
              <h2>{label}</h2>
            </div>
            <strong className="dashboard-metric-value">{value}</strong>
            <p>{hint}</p>
          </article>
        ))}
      </section>
      {jobs.length === 0 ? (
        <section className="empty-state dashboard-empty">
          <span className="empty-icon"><Icon name="briefcase" size={25} /></span>
          <h2>Start your pipeline</h2>
          <p>Add a job manually or import your Google Sheets CSV to populate the dashboard.</p>
          <div className="button-row">
            <Link className="button button-primary" href="/jobs/new"><Icon name="plus" size={18} />Add first job</Link>
            <Link className="button button-secondary" href="/import"><Icon name="upload" size={18} />Import CSV</Link>
          </div>
        </section>
      ) : (
        <section className="dashboard-panels" aria-label="Pipeline activity">
          <article className="dashboard-panel">
            <div className="dashboard-panel-heading">
              <span className="dashboard-panel-icon"><Icon name="chart" size={24} /></span>
              <div className="dashboard-panel-copy">
                <p className="eyebrow">Pipeline</p><h2>Jobs by status</h2>
                <p>See how your opportunities are distributed across the pipeline.</p>
              </div>
              <span className="dashboard-context">Total ({summary.metrics.total})</span>
            </div>
            <StatusChart data={summary.byStatus} />
          </article>
          <article className="dashboard-panel">
            <div className="dashboard-panel-heading">
              <span className="dashboard-panel-icon"><Icon name="trend" size={24} /></span>
              <div className="dashboard-panel-copy">
                <p className="eyebrow">Momentum</p><h2>Applications over time</h2>
                <p>Track your job applications to see your momentum.</p>
              </div>
              <span className="dashboard-context">Monthly</span>
            </div>
            <TrendChart data={summary.applicationsOverTime} label="Applications over time" color="#3563ff" />
          </article>
          <article className="dashboard-panel dashboard-panel-wide">
            <div className="dashboard-panel-heading">
              <span className="dashboard-panel-icon"><Icon name="archive" size={23} /></span>
              <div className="dashboard-panel-copy">
                <p className="eyebrow">Outcomes</p><h2>Rejections over time</h2>
                <p>Track rejected outcomes to spot trends and learn over time.</p>
              </div>
              <span className="dashboard-context">Monthly</span>
            </div>
            <TrendChart data={summary.rejectionsOverTime} label="Rejections over time" color="#ef4c91" />
          </article>
        </section>
      )}
    </div>
  );
}
