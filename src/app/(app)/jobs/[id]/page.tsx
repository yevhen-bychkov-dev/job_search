import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmSubmitButton } from "@/components/ui/submit-button";
import { requireIdentity } from "@/features/auth/session";
import { deleteJobAction } from "@/features/jobs/actions";
import { StatusBadge } from "@/features/jobs/status-badge";
import { StatusForm } from "@/features/jobs/status-form";
import { EMPLOYMENT_TYPE_LABELS, JOB_STATUS_LABELS, WORK_MODE_LABELS } from "@/features/jobs/types";
import { getAppStore } from "@/lib/data/server-store";

export const metadata: Metadata = { title: "Job details" };

export default async function JobDetailPage({ params, searchParams }: PageProps<"/jobs/[id]">) {
  const identity = await requireIdentity();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const store = getAppStore();
  const [job, allHistory] = await Promise.all([store.getJob(identity.userId, id), store.listStatusHistory(identity.userId)]);
  if (!job) notFound();
  const query = await searchParams;
  const history = allHistory.filter((event) => event.jobId === id).sort((left, right) => right.changedAt.localeCompare(left.changedAt));
  const deleteAction = deleteJobAction.bind(null, id);
  const detailRows = [
    ["Location", job.location || "Not specified"],
    ["Work mode", WORK_MODE_LABELS[job.workMode]],
    ["Employment", EMPLOYMENT_TYPE_LABELS[job.employmentType]],
    ["Salary", job.salary || "Not specified"],
    ["Source", job.source || "Not specified"],
    ["Discovered", job.discoveredOn],
    ["Applied", job.appliedOn || "Not yet"],
  ] as const;
  return (
    <div className="page-stack">
      <Link className="back-link" href="/jobs">← Back to jobs</Link>
      {query.created === "1" ? <p className="alert alert-success" role="status">Job created.</p> : null}
      {query.updated === "1" ? <p className="alert alert-success" role="status">Job updated.</p> : null}
      {query.statusUpdated === "1" ? <p className="alert alert-success" role="status">Status updated.</p> : null}
      {query.error === "delete" ? <p className="alert alert-error" role="alert">The job could not be deleted.</p> : null}
      <header className="detail-header">
        <div><div className="detail-status"><StatusBadge status={job.status} /><span>Updated {new Date(job.updatedAt).toLocaleDateString("en-GB")}</span></div><h1>{job.title}</h1><p>{job.company}</p></div>
        <div className="button-row"><Link className="button button-secondary" href={`/jobs/${id}/edit`}>Edit job</Link><form action={deleteAction}><ConfirmSubmitButton confirmation={`Delete ${job.title} at ${job.company}? This cannot be undone.`}>Delete</ConfirmSubmitButton></form></div>
      </header>
      <section className="detail-grid">
        <div className="detail-main stack-lg">
          <article className="card stack"><h2>Status</h2><StatusForm id={job.id} status={job.status} /></article>
          <article className="card stack"><h2>Description</h2><div className="rich-copy">{job.description || "No description saved."}</div></article>
          <article className="card stack"><h2>Private notes</h2><div className="rich-copy">{job.notes || "No notes saved."}</div></article>
          <article className="card stack"><h2>Status history</h2>{history.length ? <ol className="timeline">{history.map((event) => <li key={event.id}><span className="timeline-dot" /><div><strong>{event.fromStatus ? `${JOB_STATUS_LABELS[event.fromStatus]} → ${JOB_STATUS_LABELS[event.toStatus]}` : `Added as ${JOB_STATUS_LABELS[event.toStatus]}`}</strong><time dateTime={event.changedAt}>{new Date(event.changedAt).toLocaleString("en-GB")}</time></div></li>)}</ol> : <p className="muted">No recorded changes.</p>}</article>
        </div>
        <aside className="detail-aside stack">
          <article className="card"><h2>Details</h2><dl className="definition-list">{detailRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{job.sourceUrl ? <a className="button button-secondary button-full" href={job.sourceUrl} target="_blank" rel="noreferrer">Open source listing ↗</a> : null}</article>
          <article className="card"><h2>Technologies</h2>{job.technologies.length ? <div className="tag-list">{job.technologies.map((technology) => <span className="tag" key={technology}>{technology}</span>)}</div> : <p className="muted">No technologies saved.</p>}</article>
        </aside>
      </section>
    </div>
  );
}
