"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";

import { assessCvAction } from "./actions";
import { INITIAL_CV_ASSESSMENT_ACTION_STATE } from "./types";
import type { GeneratedCv } from "./types";

export function AssessCvForm({ jobId, cvs, hasSourceUrl }: { jobId: string; cvs: GeneratedCv[]; hasSourceUrl: boolean }) {
  const [state, action] = useActionState(assessCvAction.bind(null, jobId), INITIAL_CV_ASSESSMENT_ACTION_STATE);
  const disabledReason = cvs.length === 0
    ? "Generate a CV before assessing its fit."
    : !hasSourceUrl
      ? "Add a valid source URL to this vacancy before assessing CV fit."
      : "";

  return <section className="cv-assessment-control stack" aria-labelledby="cv-assessment-heading">
    <div>
      <p className="eyebrow">CV-to-vacancy comparison</p>
      <h3 id="cv-assessment-heading">Assess generated CV fit</h3>
    </div>
    <p className="muted">Choose one generated CV. Gemini compares that exact version with the saved vacancy and source-link snapshot, then returns a structured score and explanation. This is a CV comparison aid, not a prediction of the hiring outcome.</p>
    <form action={action} className="cv-assessment-form">
      <label htmlFor="assessment-cv-id">Generated CV</label>
      <select id="assessment-cv-id" name="cvId" defaultValue={cvs[0]?.id} required disabled={cvs.length === 0}>
        {cvs.map((cv) => <option key={cv.id} value={cv.id}>CV #{cv.version}</option>)}
      </select>
      <SubmitButton pendingLabel="Assessing CV fit…" disabled={Boolean(disabledReason)}>Assess CV fit</SubmitButton>
    </form>
    {disabledReason ? <p className="muted">{disabledReason}</p> : null}
    {state.message ? <p className={`inline-message ${state.status === "error" ? "error" : "success"}`} role={state.status === "error" ? "alert" : "status"} aria-live="polite">{state.message}</p> : null}
  </section>;
}
