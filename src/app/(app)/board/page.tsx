import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { SourceBadge } from "@/components/ui/source-badge";
import { requireIdentity } from "@/features/auth/session";
import { StatusForm } from "@/features/jobs/status-form";
import { JOB_STATUS_LABELS, JOB_STATUSES } from "@/features/jobs/types";
import { getAppStore } from "@/lib/data/server-store";

export const metadata: Metadata = { title: "Board" };

export default async function BoardPage({ searchParams }: PageProps<"/board">) {
  const identity = await requireIdentity();
  const query = await searchParams;
  const jobs = await getAppStore().listJobs(identity.userId);
  return (
    <div className="page-stack board-page">
      <PageHeader eyebrow="Workflow" title="Board" description="Review the pipeline by status and move jobs forward with a simple update." action={<Link className="button button-primary" href="/jobs/new">Add job</Link>} />
      {query.statusUpdated === "1" ? <p className="alert alert-success" role="status">Status updated.</p> : null}
      {jobs.length === 0 ? <section className="empty-state"><span className="empty-icon">▦</span><h2>Your board is empty</h2><p>Add or import jobs to start building the workflow.</p><Link className="button button-primary" href="/jobs/new">Add first job</Link></section> : (
        <div className="board" aria-label="Jobs grouped by status">
          {JOB_STATUSES.map((status) => {
            const columnJobs = jobs.filter((job) => job.status === status);
            return <section className="board-column" key={status} aria-labelledby={`column-${status}`}><header><h2 id={`column-${status}`}>{JOB_STATUS_LABELS[status]}</h2><span>{columnJobs.length}</span></header><div className="board-cards">{columnJobs.length ? columnJobs.map((job) => <article className="job-card" key={job.id}><Link href={`/jobs/${job.id}`}><span className="job-card-source"><SourceBadge source={job.source} externalSource={job.externalSource} /><span className="job-card-company">{job.company}</span></span><strong>{job.title}</strong><span className="job-card-location">{job.location || "Location not specified"}</span></Link><StatusForm id={job.id} status={job.status} compact returnTo="/board" /></article>) : <p className="column-empty">No jobs</p>}</div></section>;
          })}
        </div>
      )}
    </div>
  );
}
