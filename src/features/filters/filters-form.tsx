"use client";

import { useActionState, useEffect, useRef } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { INITIAL_ACTION_STATE } from "@/features/jobs/types";

import { saveFiltersAction } from "./actions";
import type { FilterSettings } from "./types";

export function FiltersForm({ filters }: { filters: FilterSettings }) {
  const [state, action] = useActionState(saveFiltersAction, INITIAL_ACTION_STATE);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.status === "error") feedbackRef.current?.focus();
  }, [state]);
  const value = (name: string, fallback: string) => state.values?.[name] ?? fallback;
  return (
    <form key={state.values ? JSON.stringify(state.values) : "initial"} action={action} className="form-card stack">
      <div className="field">
        <label htmlFor="includedTechnologies">Included technologies</label>
        <textarea id="includedTechnologies" name="includedTechnologies" rows={4} defaultValue={value("includedTechnologies", filters.includedTechnologies.join("\n"))} aria-describedby="included-help" />
        <p id="included-help" className="field-help">One per line or comma-separated. A future source record may match any included technology.</p>
      </div>
      <div className="field">
        <label htmlFor="excludedTechnologies">Excluded technologies</label>
        <textarea id="excludedTechnologies" name="excludedTechnologies" rows={4} defaultValue={value("excludedTechnologies", filters.excludedTechnologies.join("\n"))} aria-describedby="excluded-error" aria-invalid={Boolean(state.errors?.excludedTechnologies)} />
        <p id="excluded-error" className="field-error">{state.errors?.excludedTechnologies}</p>
      </div>
      <div className="field">
        <label htmlFor="preferredTitles">Preferred job titles</label>
        <textarea id="preferredTitles" name="preferredTitles" rows={4} defaultValue={value("preferredTitles", filters.preferredTitles.join("\n"))} aria-describedby="titles-help" />
        <p id="titles-help" className="field-help">Optional. Leave blank to accept any title that passes technology filters.</p>
      </div>
      {state.message ? <p ref={feedbackRef} className={`alert alert-${state.status}`} role={state.status === "error" ? "alert" : "status"} tabIndex={-1}>{state.message}</p> : null}
      <SubmitButton pendingLabel="Saving filters…">Save filters</SubmitButton>
    </form>
  );
}
