"use client";

import { useActionState, useCallback, useMemo, useRef, useState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";

import { confirmCvAction, generateCvAction } from "./actions";
import type { CvActionState, ResumeConfirmationQuestion, ResumeConfirmationLevel } from "./types";
import { INITIAL_CV_ACTION_STATE } from "./types";

function Feedback({ state }: { state: CvActionState }) {
  return state.message ? <p className={`inline-message ${state.status === "error" ? "error" : state.status === "confirmation" ? "status" : "success"}`} role={state.status === "error" ? "alert" : "status"} tabIndex={-1}>{state.message}</p> : null;
}

function ConfirmationForm({ generationId, questions, onSuccess, onClose }: { generationId: string; questions: ResumeConfirmationQuestion[]; onSuccess: (message: string) => void; onClose: () => void }) {
  const [answers, setAnswers] = useState<Record<string, ResumeConfirmationLevel>>({});
  const action = useCallback(async (previous: CvActionState, formData: FormData) => {
    const result = await confirmCvAction(generationId, previous, formData);
    if (result.status === "success") onSuccess(result.message);
    return result;
  }, [generationId, onSuccess]);
  const [state, formAction] = useActionState(action, INITIAL_CV_ACTION_STATE);
  const serialized = useMemo(() => JSON.stringify(questions.map((question) => ({ key: question.key, level: answers[question.key] ?? "" }))), [answers, questions]);
  return <dialog open className="resume-confirmation-modal" aria-labelledby="resume-confirmation-heading"><div className="card stack"><div className="confirmation-heading"><div><p className="eyebrow">Requirement check</p><h3 id="resume-confirmation-heading">Confirm important vacancy requirements</h3></div><button type="button" className="modal-close-button" aria-label="Close requirement confirmation" onClick={onClose}>×</button></div><p className="muted">Only these materially relevant items are unconfirmed. Familiar answers are never presented as commercial experience.</p><form action={formAction} className="stack">{questions.map((question) => <fieldset className="confirmation-fieldset" key={question.key}><legend>{question.label}</legend><label><input type="radio" name={`requirement-${question.key}`} required checked={answers[question.key] === "commercial"} onChange={() => setAnswers((current) => ({ ...current, [question.key]: "commercial" }))} /> Commercial experience</label><label><input type="radio" name={`requirement-${question.key}`} checked={answers[question.key] === "familiar"} onChange={() => setAnswers((current) => ({ ...current, [question.key]: "familiar" }))} /> Familiar / can work with it</label><label><input type="radio" name={`requirement-${question.key}`} checked={answers[question.key] === "none"} onChange={() => setAnswers((current) => ({ ...current, [question.key]: "none" }))} /> No experience</label></fieldset>)}<input type="hidden" name="answers" value={serialized} /><SubmitButton pendingLabel="Generating resume…">Confirm and generate resume</SubmitButton><Feedback state={state} /></form></div></dialog>;
}

export function GenerateCvForm({ jobId }: { jobId: string }) {
  const idempotencyInput = useRef<HTMLInputElement>(null);
  const [confirmationOpen, setConfirmationOpen] = useState(true);
  const [completionMessage, setCompletionMessage] = useState("");
  const [state, formAction] = useActionState(generateCvAction.bind(null, jobId), INITIAL_CV_ACTION_STATE);
  return <div className="cv-generate-form"><form action={formAction} onSubmit={() => { setConfirmationOpen(true); setCompletionMessage(""); if (idempotencyInput.current) idempotencyInput.current.value = crypto.randomUUID(); }}><input ref={idempotencyInput} type="hidden" name="idempotencyKey" defaultValue="pending" /><SubmitButton pendingLabel="Analyzing vacancy…">Generate Resume</SubmitButton>{completionMessage ? <p className="inline-message success" role="status">{completionMessage}</p> : <Feedback state={state} />}</form>{confirmationOpen && state.status === "confirmation" && state.generationId && state.questions ? <ConfirmationForm generationId={state.generationId} questions={state.questions} onSuccess={(message) => { setConfirmationOpen(false); setCompletionMessage(message); }} onClose={() => setConfirmationOpen(false)} /> : null}</div>;
}
