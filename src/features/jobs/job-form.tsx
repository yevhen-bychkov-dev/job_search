"use client";

import { useActionState, useEffect, useRef } from "react";

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
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.status === "error") feedbackRef.current?.focus();
  }, [state]);
  const value = (name: string, fallback?: string) => state.values?.[name] ?? fallback ?? "";
  return (
    <form key={state.values ? JSON.stringify(state.values) : "initial"} action={formAction} className="form-card" noValidate>
      {job ? <input type="hidden" name="updatedAt" value={job.updatedAt} /> : null}
      <div className="form-grid">
        <div className="field field-span-2">
          <label htmlFor="title">Job title</label>
          <input id="title" name="title" defaultValue={value("title", job?.title)} required maxLength={200} aria-describedby="title-error" aria-invalid={Boolean(state.errors?.title)} />
          <ErrorText id="title-error" message={state.errors?.title} />
        </div>
        <div className="field field-span-2">
          <label htmlFor="company">Company</label>
          <input id="company" name="company" defaultValue={value("company", job?.company)} required maxLength={200} aria-describedby="company-error" aria-invalid={Boolean(state.errors?.company)} />
          <ErrorText id="company-error" message={state.errors?.company} />
        </div>
        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={value("status", job?.status ?? "new")} aria-describedby="status-error" aria-invalid={Boolean(state.errors?.status)}>
            {JOB_STATUSES.map((status) => <option key={status} value={status}>{JOB_STATUS_LABELS[status]}</option>)}
          </select>
          <ErrorText id="status-error" message={state.errors?.status} />
        </div>
        <div className="field">
          <label htmlFor="source">Source</label>
          <input id="source" name="source" defaultValue={value("source", job?.source)} maxLength={120} placeholder="LinkedIn, referral…" />
        </div>
        <div className="field field-span-2">
          <label htmlFor="sourceUrl">Source URL</label>
          <input id="sourceUrl" name="sourceUrl" type="url" defaultValue={value("sourceUrl", job?.sourceUrl)} maxLength={2048} aria-describedby="source-url-error" aria-invalid={Boolean(state.errors?.sourceUrl)} />
          <ErrorText id="source-url-error" message={state.errors?.sourceUrl} />
        </div>
        <div className="field field-span-2">
          <label htmlFor="location">Location</label>
          <input id="location" name="location" defaultValue={value("location", job?.location)} maxLength={200} />
        </div>
        <div className="field">
          <label htmlFor="workMode">Work mode</label>
          <select id="workMode" name="workMode" defaultValue={value("workMode", job?.workMode ?? "unspecified")}>
            {WORK_MODES.map((mode) => <option key={mode} value={mode}>{WORK_MODE_LABELS[mode]}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="employmentType">Employment type</label>
          <select id="employmentType" name="employmentType" defaultValue={value("employmentType", job?.employmentType ?? "unspecified")}>
            {EMPLOYMENT_TYPES.map((type) => <option key={type} value={type}>{EMPLOYMENT_TYPE_LABELS[type]}</option>)}
          </select>
        </div>
        <div className="field field-span-2">
          <label htmlFor="salary">Salary information</label>
          <input id="salary" name="salary" defaultValue={value("salary", job?.salary)} maxLength={200} placeholder="Optional" />
        </div>
        <div className="field">
          <label htmlFor="discoveredOn">Date discovered</label>
          <input id="discoveredOn" name="discoveredOn" type="date" defaultValue={value("discoveredOn", job?.discoveredOn ?? defaultDiscoveredOn)} required aria-describedby="discovered-error" aria-invalid={Boolean(state.errors?.discoveredOn)} />
          <ErrorText id="discovered-error" message={state.errors?.discoveredOn} />
        </div>
        <div className="field">
          <label htmlFor="appliedOn">Date applied</label>
          <input id="appliedOn" name="appliedOn" type="date" defaultValue={value("appliedOn", job?.appliedOn)} aria-describedby="applied-error" aria-invalid={Boolean(state.errors?.appliedOn)} />
          <ErrorText id="applied-error" message={state.errors?.appliedOn} />
        </div>
        <div className="field field-span-4">
          <label htmlFor="technologies">Technologies</label>
          <input id="technologies" name="technologies" defaultValue={value("technologies", job?.technologies.join(", "))} placeholder="React, TypeScript, Next.js" />
          <p className="field-help">Separate technologies with commas, semicolons, or pipes.</p>
        </div>
        <div className="field field-span-4">
          <label htmlFor="description">Description</label>
          <textarea id="description" name="description" rows={8} defaultValue={value("description", job?.description)} maxLength={30000} />
        </div>
        <div className="field field-span-4">
          <label htmlFor="notes">Private notes</label>
          <textarea id="notes" name="notes" rows={5} defaultValue={value("notes", job?.notes)} maxLength={20000} />
        </div>
      </div>
      {state.message ? <p ref={feedbackRef} className={`alert alert-${state.status}`} role="alert" tabIndex={-1}>{state.message}</p> : null}
      <div className="form-actions">
        <SubmitButton pendingLabel="Saving job…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
