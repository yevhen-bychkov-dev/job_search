"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import { SubmitButton } from "@/components/ui/submit-button";

import { generateCvAction, renderCvAction } from "./actions";
import { INITIAL_CV_ACTION_STATE } from "./types";
import type { CvActionState } from "./types";

function Feedback({ state }: { state: CvActionState }) {
  if (!state.message) return null;
  return <p className={`inline-message ${state.status === "error" ? "error" : state.status === "success" ? "success" : "status"}`} role={state.status === "error" ? "alert" : "status"} aria-live="polite">{state.message}</p>;
}

export function GenerateCvForm({ jobId, canGenerate, disabledReason }: { jobId: string; canGenerate: boolean; disabledReason?: string }) {
  const idempotencyInput = useRef<HTMLInputElement>(null);
  const lastRenderRequest = useRef<string | null>(null);
  const [generationState, generationAction] = useActionState(generateCvAction.bind(null, jobId), INITIAL_CV_ACTION_STATE);
  const [renderState, setRenderState] = useState<CvActionState>(INITIAL_CV_ACTION_STATE);
  const [, startRenderTransition] = useTransition();

  useEffect(() => {
    if (generationState.status !== "ready_to_render" || !generationState.generationId || lastRenderRequest.current === generationState.generationId) return;
    const generationId = generationState.generationId;
    lastRenderRequest.current = generationId;
    setRenderState({ status: "in_progress", message: "Rendering the PDF…", generationId, stage: "render" });
    startRenderTransition(async () => {
      const formData = new FormData();
      formData.set("generationId", generationId);
      try {
        setRenderState(await renderCvAction(jobId, INITIAL_CV_ACTION_STATE, formData));
      } catch {
        setRenderState({
          status: "error",
          message: "PDF rendering was interrupted before the server returned a result. Your structured resume is preserved; retry to resume rendering.",
          generationId,
          stage: "render",
        });
      }
    });
  }, [generationState, jobId]);

  const feedback = renderState.status !== "idle" ? renderState : generationState;
  return <div className="cv-generate-form stack">
    <form action={generationAction} onSubmit={() => {
      lastRenderRequest.current = null;
      setRenderState(INITIAL_CV_ACTION_STATE);
      if (idempotencyInput.current) idempotencyInput.current.value = crypto.randomUUID();
    }}>
      <input ref={idempotencyInput} type="hidden" name="idempotencyKey" defaultValue="pending" />
      <SubmitButton pendingLabel="Generating structured resume…" disabled={!canGenerate}>Generate tailored resume</SubmitButton>
    </form>
    {!canGenerate && disabledReason ? <p className="muted">{disabledReason}</p> : null}
    <Feedback state={feedback} />
  </div>;
}
