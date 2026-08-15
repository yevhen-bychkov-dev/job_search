import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { requireIdentity } from "@/features/auth/session";
import { parseJobStatus, parseWorkMode } from "@/features/jobs/domain";
import { StatusBadge } from "@/features/jobs/status-badge";
import { JOB_STATUS_LABELS, JOB_STATUSES, WORK_MODE_LABELS, WORK_MODES } from "@/features/jobs/types";
import { getAppStore } from "@/lib/data/server-store";

export const metadata: Metadata = { title: "Jobs" };

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function JobsPage({ searchParams }: PageProps<"/jobs">) {
  const identity = await requireIdentity();
  const query = await searchParams;
  const search = one(query.search).trim().slice(0, 100);
  const statusValue = one(query.status);
  const workModeValue = one(query.workMode);
  const status = statusValue ? (parseJobStatus(statusValue) ?? undefined) : undefined;
  const workMode = workModeValue ? (parseWorkMode(workModeValue) ?? undefined) : undefined;
  const jobs = await getAppStore().listJobs(identity.userId, { search, status, workMode });
  return (
    <div className="page-stack">
      <PageHeader eyebrow="Pipeline" title="Jobs" description="Search, filter, and manage every opportunity in one place." action={<Link className="button button-primary" href="/jobs/new">Add job</Link>} />
      {query.deleted === "1" ? <p className="alert alert-success" role="status">Job deleted.</p> : null}
      <form className="filter-bar" method="get">
        <div className="field search-field"><label className="sr-only" htmlFor="search">Search jobs</label><input id="search" name="search" type="search" defaultValue={search} placeholder="Search title, company, technology…" /></div>
        <div className="field"><label className="sr-only" htmlFor="status-filter">Status</label><select id="status-filter" name="status" defaultValue={status ?? ""}><option value="">All statuses</option>{JOB_STATUSES.map((item) => <option key={item} value={item}>{JOB_STATUS_LABELS[item]}</option>)}</select></div>
        <div className="field"><label className="sr-only" htmlFor="work-filter">Work mode</label><select id="work-filter" name="workMode" defaultValue={workMode ?? ""}><option value="">All work modes</option>{WORK_MODES.filter((item) => item !== "unspecified").map((item) => <option key={item} value={item}>{WORK_MODE_LABELS[item]}</option>)}</select></div>
        <button className="button button-secondary" type="submit">Apply filters</button>
        {(search || status || workMode) ? <Link className="text-link" href="/jobs">Clear</Link> : null}
      </form>
      {jobs.length === 0 ? (
        <section className="empty-state"><span className="empty-icon">⌕</span><h2>{search || status || workMode ? "No jobs match these filters" : "No jobs yet"}</h2><p>{search || status || workMode ? "Try a broader search or clear the filters." : "Add the first opportunity or import your spreadsheet history."}</p><div className="button-row"><Link className="button button-primary" href="/jobs/new">Add job</Link><Link className="button button-secondary" href="/import">Import CSV</Link></div></section>
      ) : (
        <div className="card table-wrap">
          <table className="jobs-table"><thead><tr><th>Job</th><th>Status</th><th>Location</th><th>Work mode</th><th>Discovered</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
            {jobs.map((job) => <tr key={job.id}><td><Link className="job-link" href={`/jobs/${job.id}`}><strong>{job.title}</strong><span>{job.company}</span></Link></td><td><StatusBadge status={job.status} /></td><td>{job.location || "—"}</td><td>{WORK_MODE_LABELS[job.workMode]}</td><td>{job.discoveredOn}</td><td><Link className="text-link" href={`/jobs/${job.id}`}>Open</Link></td></tr>)}
          </tbody></table>
        </div>
      )}
    </div>
  );
}
