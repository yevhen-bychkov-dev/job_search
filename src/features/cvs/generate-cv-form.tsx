"use client";

import { useActionState, useRef } from "react";

import { SubmitButton } from "@/components/ui/submit-button";

import { generateCvAction } from "./actions";
import { INITIAL_CV_ACTION_STATE } from "./types";
import type { CvActionState } from "./types";

function Feedback({ state }: { state: CvActionState }) {
  if (!state.message) return null;
  return <p className={`inline-message ${state.status === "error" ? "error" : state.status === "success" ? "success" : "status"}`} role={state.status === "error" ? "alert" : "status"} aria-live="polite">{state.message}</p>;
}

export function GenerateCvForm({ jobId, canGenerate, disabledReason }: { jobId: string; canGenerate: boolean; disabledReason?: string }) {
  const idempotencyInput = useRef<HTMLInputElement>(null);
  const [generationState, generationAction] = useActionState(generateCvAction.bind(null, jobId), INITIAL_CV_ACTION_STATE);
  return <div className="cv-generate-form stack">
    <form action={generationAction} onSubmit={() => {
      if (idempotencyInput.current) idempotencyInput.current.value = crypto.randomUUID();
    }}>
      <input ref={idempotencyInput} type="hidden" name="idempotencyKey" defaultValue="pending" />
      <SubmitButton pendingLabel="Generating and rendering CV…" disabled={!canGenerate}>Generate tailored resume</SubmitButton>
    </form>
    {!canGenerate && disabledReason ? <p className="muted">{disabledReason}</p> : null}
    <Feedback state={generationState} />
  </div>;
}
