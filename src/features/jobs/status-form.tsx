"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";

import { changeJobStatusAction } from "./actions";
import { INITIAL_ACTION_STATE, JOB_STATUS_LABELS, JOB_STATUSES, type JobStatus } from "./types";

export function StatusForm({ id, status, compact = false, returnTo = `/jobs/${id}` }: { id: string; status: JobStatus; compact?: boolean; returnTo?: string }) {
  const [state, action] = useActionState(changeJobStatusAction, INITIAL_ACTION_STATE);
  return (
    <form action={action} className={compact ? "status-form status-form-compact" : "status-form"}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <label className={compact ? "sr-only" : undefined} htmlFor={`status-${id}`}>Status</label>
      <select id={`status-${id}`} name="status" defaultValue={status} aria-label={compact ? "Change job status" : undefined}>
        {JOB_STATUSES.map((option) => <option value={option} key={option}>{JOB_STATUS_LABELS[option]}</option>)}
      </select>
      <SubmitButton className="button button-secondary button-small" pendingLabel="Updating…">Update</SubmitButton>
      {state.message ? <span className={`inline-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</span> : null}
    </form>
  );
}
