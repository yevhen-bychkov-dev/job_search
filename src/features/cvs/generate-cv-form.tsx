"use client";

import { useActionState, useEffect, useRef } from "react";

import { SubmitButton } from "@/components/ui/submit-button";

import { generateCvAction } from "./actions";
import { INITIAL_CV_ACTION_STATE } from "./types";

export function GenerateCvForm({ jobId }: { jobId: string }) {
  const action = generateCvAction.bind(null, jobId);
  const [state, formAction] = useActionState(action, INITIAL_CV_ACTION_STATE);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.status === "error") feedbackRef.current?.focus();
  }, [state]);
  return (
    <form action={formAction} className="cv-generate-form">
      <SubmitButton pendingLabel="Generating CV…">Generate CV</SubmitButton>
      {state.message ? <p ref={feedbackRef} className={`inline-message ${state.status}`} role={state.status === "error" ? "alert" : "status"} tabIndex={-1}>{state.message}</p> : null}
    </form>
  );
}
