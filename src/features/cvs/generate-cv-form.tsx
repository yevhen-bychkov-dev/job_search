"use client";

import { useActionState, useRef } from "react";

import { SubmitButton } from "@/components/ui/submit-button";

import { generateCvAction } from "./actions";
import type { CvActionState } from "./types";
import { INITIAL_CV_ACTION_STATE } from "./types";

function Feedback({ state }: { state: CvActionState }) {
  return state.message ? <p className={`inline-message ${state.status === "error" ? "error" : state.status === "confirmation" ? "status" : "success"}`} role={state.status === "error" ? "alert" : "status"} tabIndex={-1}>{state.message}</p> : null;
}

export function GenerateCvForm({ jobId, hasRequirements }: { jobId: string; hasRequirements: boolean }) {
  const idempotencyInput = useRef<HTMLInputElement>(null);
  const [state, formAction] = useActionState(generateCvAction.bind(null, jobId), INITIAL_CV_ACTION_STATE);
  return <div className="cv-generate-form"><form action={formAction} onSubmit={() => { if (idempotencyInput.current) idempotencyInput.current.value = crypto.randomUUID(); }}><input ref={idempotencyInput} type="hidden" name="idempotencyKey" defaultValue="pending" /><SubmitButton pendingLabel="Generating CV…" disabled={!hasRequirements}>Generate CV</SubmitButton><Feedback state={state} /></form></div>;
}
