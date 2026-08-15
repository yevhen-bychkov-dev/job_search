"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";

import {
  EMPLOYMENT_TYPE_LABELS,
  EMPLOYMENT_TYPES,
  INITIAL_ACTION_STATE,
  JOB_STATUS_LABELS,
  JOB_STATUSES,
  type ActionState,
  type Job,
  WORK_MODE_LABELS,
  WORK_MODES,
} from "./types";

type JobFormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

function ErrorText({ id, message }: { id: string; message?: string }) {
  return <p id={id} className="field-error">{message}</p>;
}

export function JobForm({
  action,
  job,
  submitLabel,
  defaultDiscoveredOn,
}: {
  action: JobFormAction;
  job?: Job;
  submitLabel: string;
  defaultDiscoveredOn?: string;
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form action={formAction} className="form-card" noValidate>
      <div className="form-grid">
        <div className="field field-span-2">
          <label htmlFor="title">Job title</label>
          <input id="title" name="title" defaultValue={job?.title} required maxLength={200} aria-describedby="title-error" />
          <ErrorText id="title-error" message={state.errors?.title} />
        </div>
        <div className="field field-span-2">
          <label htmlFor="company">Company</label>
          <input id="company" name="company" defaultValue={job?.company} required maxLength={200} aria-describedby="company-error" />
          <ErrorText id="company-error" message={state.errors?.company} />
        </div>
        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={job?.status ?? "new"}>
            {JOB_STATUSES.map((status) => <option key={status} value={status}>{JOB_STATUS_LABELS[status]}</option>)}
          </select>
          <ErrorText id="status-error" message={state.errors?.status} />
        </div>
        <div className="field">
          <label htmlFor="source">Source</label>
          <input id="source" name="source" defaultValue={job?.source} maxLength={120} placeholder="LinkedIn, referral…" />
        </div>
        <div className="field field-span-2">
          <label htmlFor="sourceUrl">Source URL</label>
          <input id="sourceUrl" name="sourceUrl" type="url" defaultValue={job?.sourceUrl} maxLength={2048} aria-describedby="source-url-error" />
          <ErrorText id="source-url-error" message={state.errors?.sourceUrl} />
        </div>
        <div className="field field-span-2">
          <label htmlFor="location">Location</label>
          <input id="location" name="location" defaultValue={job?.location} maxLength={200} />
        </div>
        <div className="field">
          <label htmlFor="workMode">Work mode</label>
          <select id="workMode" name="workMode" defaultValue={job?.workMode ?? "unspecified"}>
            {WORK_MODES.map((mode) => <option key={mode} value={mode}>{WORK_MODE_LABELS[mode]}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="employmentType">Employment type</label>
          <select id="employmentType" name="employmentType" defaultValue={job?.employmentType ?? "unspecified"}>
            {EMPLOYMENT_TYPES.map((type) => <option key={type} value={type}>{EMPLOYMENT_TYPE_LABELS[type]}</option>)}
          </select>
        </div>
        <div className="field field-span-2">
          <label htmlFor="salary">Salary information</label>
          <input id="salary" name="salary" defaultValue={job?.salary} maxLength={200} placeholder="Optional" />
        </div>
        <div className="field">
          <label htmlFor="discoveredOn">Date discovered</label>
          <input id="discoveredOn" name="discoveredOn" type="date" defaultValue={job?.discoveredOn ?? defaultDiscoveredOn} required aria-describedby="discovered-error" />
          <ErrorText id="discovered-error" message={state.errors?.discoveredOn} />
        </div>
        <div className="field">
          <label htmlFor="appliedOn">Date applied</label>
          <input id="appliedOn" name="appliedOn" type="date" defaultValue={job?.appliedOn} aria-describedby="applied-error" />
          <ErrorText id="applied-error" message={state.errors?.appliedOn} />
        </div>
        <div className="field field-span-4">
          <label htmlFor="technologies">Technologies</label>
          <input id="technologies" name="technologies" defaultValue={job?.technologies.join(", ")} placeholder="React, TypeScript, Next.js" />
          <p className="field-help">Separate technologies with commas, semicolons, or pipes.</p>
        </div>
        <div className="field field-span-4">
          <label htmlFor="description">Description</label>
          <textarea id="description" name="description" rows={8} defaultValue={job?.description} maxLength={30000} />
        </div>
        <div className="field field-span-4">
          <label htmlFor="notes">Private notes</label>
          <textarea id="notes" name="notes" rows={5} defaultValue={job?.notes} maxLength={20000} />
        </div>
      </div>
      {state.message ? <p className={`alert alert-${state.status}`} role="alert">{state.message}</p> : null}
      <div className="form-actions">
        <SubmitButton pendingLabel="Saving job…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
