"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import { SourceBadge } from "@/components/ui/source-badge";

import { bulkJobsAction } from "./actions";
import { StatusBadge } from "./status-badge";
import {
  INITIAL_BULK_JOB_ACTION_STATE,
  JOB_STATUS_LABELS,
  JOB_STATUSES,
  WORK_MODE_LABELS,
  type JobStatus,
  type WorkMode,
} from "./types";

export type BulkJobRow = {
  id: string;
  title: string;
  company: string;
  source: string;
  externalSource?: string;
  status: JobStatus;
  location: string;
  workMode: WorkMode;
  discoveredOn: string;
  archivedAt: string;
};

export function BulkJobsTable({ jobs, archiveMode }: { jobs: BulkJobRow[]; archiveMode: "active" | "archived" }) {
  const [state, action, pending] = useActionState(bulkJobsAction, INITIAL_BULK_JOB_ACTION_STATE);
  const [selection, setSelection] = useState<{ actionState: typeof state; ids: string[] }>({ actionState: state, ids: [] });
  const displayedIds = useMemo(() => new Set(jobs.map((job) => job.id)), [jobs]);
  const selectedIds = selection.actionState === state ? selection.ids.filter((id) => displayedIds.has(id)) : [];
  const allSelected = jobs.length > 0 && selectedIds.length === jobs.length;

  return (
    <form className="bulk-jobs-form" action={action}>
      <div className="bulk-toolbar" aria-label="Bulk job actions">
        <span className="bulk-selection-count" aria-live="polite">{selectedIds.length} selected</span>
        <div className="field bulk-status-field">
          <label className="sr-only" htmlFor={`bulk-status-${archiveMode}`}>New status</label>
          <select id={`bulk-status-${archiveMode}`} name="status" defaultValue="" disabled={pending}>
            <option value="">Choose status</option>
            {JOB_STATUSES.map((status) => <option key={status} value={status}>{JOB_STATUS_LABELS[status]}</option>)}
          </select>
        </div>
        <button className="button button-secondary button-small" type="submit" name="operation" value="status" disabled={pending || selectedIds.length === 0}>Update status</button>
        <button
          className={`button button-small ${archiveMode === "active" ? "button-danger" : "button-secondary"}`}
          type="submit"
          name="operation"
          value={archiveMode === "active" ? "archive" : "restore"}
          disabled={pending || selectedIds.length === 0}
        >
          {pending ? "Updating…" : archiveMode === "active" ? "Archive selected" : "Restore selected"}
        </button>
      </div>
      <p className={`alert alert-${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>
      <div className="card table-wrap">
        <table className="jobs-table">
          <thead><tr>
            <th className="selection-column"><input type="checkbox" aria-label="Select all displayed jobs" checked={allSelected} onChange={(event) => setSelection({ actionState: state, ids: event.target.checked ? jobs.map((job) => job.id) : [] })} /></th>
            <th>Job</th><th>Status</th><th>Location</th><th>Work mode</th><th>{archiveMode === "archived" ? "Archived" : "Discovered"}</th><th><span className="sr-only">Actions</span></th>
          </tr></thead>
          <tbody>{jobs.map((job) => {
            const checked = selectedIds.includes(job.id);
            return <tr key={job.id}>
              <td className="selection-column"><input type="checkbox" name="ids" value={job.id} aria-label={`Select ${job.title} at ${job.company}`} checked={checked} onChange={(event) => setSelection({ actionState: state, ids: event.target.checked ? [...selectedIds, job.id] : selectedIds.filter((id) => id !== job.id) })} /></td>
              <td><div className="job-list-identity"><SourceBadge source={job.source} externalSource={job.externalSource} /><Link className="job-link" href={`/jobs/${job.id}`}><strong>{job.title}</strong><span>{job.company}</span></Link></div></td>
              <td><StatusBadge status={job.status} /></td><td>{job.location || "—"}</td><td>{WORK_MODE_LABELS[job.workMode]}</td>
              <td>{archiveMode === "archived" ? job.archivedAt.slice(0, 10) : job.discoveredOn}</td>
              <td><Link className="text-link" href={`/jobs/${job.id}`}>Open</Link></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </form>
  );
}
