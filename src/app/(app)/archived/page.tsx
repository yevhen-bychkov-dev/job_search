import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { requireIdentity } from "@/features/auth/session";
import { BulkJobsTable } from "@/features/jobs/bulk-jobs-table";
import { parseJobStatus, parseWorkMode } from "@/features/jobs/domain";
import { JOB_STATUS_LABELS, JOB_STATUSES, WORK_MODE_LABELS, WORK_MODES } from "@/features/jobs/types";
import { getAppStore } from "@/lib/data/server-store";

export const metadata: Metadata = { title: "Archived jobs" };

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function ArchivedJobsPage({ searchParams }: PageProps<"/archived">) {
  const identity = await requireIdentity();
  const query = await searchParams;
  const search = one(query.search).trim().slice(0, 100);
  const statusValue = one(query.status);
  const workModeValue = one(query.workMode);
  const status = statusValue ? (parseJobStatus(statusValue) ?? undefined) : undefined;
  const workMode = workModeValue ? (parseWorkMode(workModeValue) ?? undefined) : undefined;
  const jobs = await getAppStore().listJobs(identity.userId, { search, status, workMode, archive: "archived" });
  return (
    <div className="page-stack">
      <PageHeader eyebrow="History" title="Archived jobs" description="Review hidden opportunities, update them in bulk, or restore them to your active pipeline." />
      {query.restored === "1" ? <p className="alert alert-success" role="status">Job restored.</p> : null}
      <form className="filter-bar" method="get">
        <div className="field search-field"><label className="sr-only" htmlFor="archived-search">Search archived jobs</label><input id="archived-search" name="search" type="search" defaultValue={search} placeholder="Search title, company, technology…" /></div>
        <div className="field"><label className="sr-only" htmlFor="archived-status-filter">Status</label><select id="archived-status-filter" name="status" defaultValue={status ?? ""}><option value="">All statuses</option>{JOB_STATUSES.map((item) => <option key={item} value={item}>{JOB_STATUS_LABELS[item]}</option>)}</select></div>
        <div className="field"><label className="sr-only" htmlFor="archived-work-filter">Work mode</label><select id="archived-work-filter" name="workMode" defaultValue={workMode ?? ""}><option value="">All work modes</option>{WORK_MODES.filter((item) => item !== "unspecified").map((item) => <option key={item} value={item}>{WORK_MODE_LABELS[item]}</option>)}</select></div>
        <button className="button button-secondary" type="submit">Apply filters</button>
        {(search || status || workMode) ? <Link className="text-link" href="/archived">Clear</Link> : null}
      </form>
      {jobs.length === 0 ? (
        <section className="empty-state"><span className="empty-icon">▱</span><h2>{search || status || workMode ? "No archived jobs match these filters" : "No archived jobs"}</h2><p>{search || status || workMode ? "Try a broader search or clear the filters." : "Jobs you archive from the active list will appear here."}</p><Link className="button button-secondary" href="/jobs">Back to jobs</Link></section>
      ) : (
        <BulkJobsTable jobs={jobs.map(({ id, title, company, source, externalSource, status: jobStatus, location, workMode: jobWorkMode, discoveredOn, archivedAt }) => ({ id, title, company, source, externalSource, status: jobStatus, location, workMode: jobWorkMode, discoveredOn, archivedAt }))} archiveMode="archived" />
      )}
    </div>
  );
}
