"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { SubmitButton } from "@/components/ui/submit-button";

import { generateCvAction, renderCvAction } from "./actions";
import { INITIAL_CV_ACTION_STATE } from "./types";
import type { CvActionState } from "./types";

function Feedback({ state }: { state: CvActionState }) {
  if (!state.message) return null;
  return <p className={`inline-message ${state.status === "error" ? "error" : state.status === "success" ? "success" : "status"}`} role={state.status === "error" ? "alert" : "status"} aria-live="polite">{state.message}</p>;
}

export function GenerateCvForm({ jobId, canGenerate, disabledReason }: { jobId: string; canGenerate: boolean; disabledReason?: string }) {
  const router = useRouter();
  const idempotencyInput = useRef<HTMLInputElement>(null);
  const renderForm = useRef<HTMLFormElement>(null);
  const lastRenderRequest = useRef<string | null>(null);
  const [generationState, generationAction] = useActionState(generateCvAction.bind(null, jobId), INITIAL_CV_ACTION_STATE);
  const [renderState, renderAction] = useActionState(renderCvAction.bind(null, jobId), INITIAL_CV_ACTION_STATE);

  useEffect(() => {
    if (generationState.status !== "ready_to_render" || !generationState.generationId || lastRenderRequest.current === generationState.generationId) return;
    lastRenderRequest.current = generationState.generationId;
    renderForm.current?.requestSubmit();
  }, [generationState]);

  useEffect(() => {
    if (renderState.status === "success") router.refresh();
  }, [renderState.status, router]);

  const feedback = renderState.status !== "idle" ? renderState : generationState;
  return <div className="cv-generate-form stack">
    <form action={generationAction} onSubmit={() => { if (idempotencyInput.current) idempotencyInput.current.value = crypto.randomUUID(); }}>
      <input ref={idempotencyInput} type="hidden" name="idempotencyKey" defaultValue="pending" />
      <SubmitButton pendingLabel="Generating structured resume…" disabled={!canGenerate}>Generate tailored resume</SubmitButton>
    </form>
    <form ref={renderForm} action={renderAction} aria-hidden="true">
      <input type="hidden" name="generationId" value={generationState.generationId ?? ""} readOnly />
    </form>
    {!canGenerate && disabledReason ? <p className="muted">{disabledReason}</p> : null}
    <Feedback state={feedback} />
  </div>;
}
