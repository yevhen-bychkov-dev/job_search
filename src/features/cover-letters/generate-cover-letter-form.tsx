"use client";

import { useActionState, useRef } from "react";

import { SubmitButton } from "@/components/ui/submit-button";

import { generateCoverLetterAction } from "./actions";
import { INITIAL_COVER_LETTER_ACTION_STATE } from "./types";

export function GenerateCoverLetterForm({ jobId, canGenerate, disabledReason }: { jobId: string; canGenerate: boolean; disabledReason?: string }) {
  const requestInput = useRef<HTMLInputElement>(null);
  const [state, action] = useActionState(generateCoverLetterAction.bind(null, jobId), INITIAL_COVER_LETTER_ACTION_STATE);
  return <div className="cv-generate-form stack">
    <form action={action} onSubmit={() => { if (requestInput.current) requestInput.current.value = crypto.randomUUID(); }}>
      <input ref={requestInput} type="hidden" name="requestId" defaultValue="pending" />
      <SubmitButton pendingLabel="Creating cover letter…" disabled={!canGenerate}>Create cover letter</SubmitButton>
    </form>
    {!canGenerate && disabledReason ? <p className="muted">{disabledReason}</p> : null}
    {state.message ? <p className={`inline-message ${state.status}`} role={state.status === "error" ? "alert" : "status"} aria-live="polite">{state.message}</p> : null}
  </div>;
}
