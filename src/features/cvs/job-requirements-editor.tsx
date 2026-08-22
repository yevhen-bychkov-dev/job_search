"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { SubmitButton } from "@/components/ui/submit-button";

import { analyzeRequirementsAction, saveRequirementsAction } from "./actions";
import type { RequirementsActionState, SavedJobRequirement, JobRequirementLevel, VacancyAnalysis } from "./types";
import { INITIAL_REQUIREMENTS_ACTION_STATE, JOB_REQUIREMENT_LEVELS } from "./types";

function Feedback({ state }: { state: RequirementsActionState }) {
  return state.message ? <p className={`inline-message ${state.status === "error" ? "error" : state.status === "success" ? "success" : "status"}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null;
}

function newRequirement(): SavedJobRequirement {
  return {
    key: `manual-${crypto.randomUUID()}`,
    label: "",
    category: "technical",
    importance: "must_have",
    status: "unconfirmed",
    evidence: [],
    section: "mustHaveTechnical",
    level: "unconfirmed",
    source: "user",
  };
}

function levelLabel(level: JobRequirementLevel): string {
  if (level === "commercial") return "Commercial experience";
  if (level === "familiar") return "Familiar / can work with it";
  if (level === "none") return "No experience";
  return "Needs decision";
}

export function JobRequirementsEditor({ jobId, initialAnalysis, initialRequirements, canAnalyze }: { jobId: string; initialAnalysis: VacancyAnalysis | null; initialRequirements: SavedJobRequirement[]; canAnalyze: boolean }) {
  const router = useRouter();
  const [requirements] = useState(initialRequirements);
  const [editedRequirements, setEditedRequirements] = useState<SavedJobRequirement[] | null>(null);
  const [analyzeState, analyzeAction] = useActionState(analyzeRequirementsAction.bind(null, jobId), INITIAL_REQUIREMENTS_ACTION_STATE);
  const [saveState, saveAction] = useActionState(saveRequirementsAction.bind(null, jobId), INITIAL_REQUIREMENTS_ACTION_STATE);
  const shownRequirements = editedRequirements ?? analyzeState.requirements ?? requirements;
  const analysis = analyzeState.analysis ?? initialAnalysis;
  const serialized = useMemo(() => JSON.stringify(shownRequirements), [shownRequirements]);
  const serializedAnalysis = useMemo(() => JSON.stringify(analysis), [analysis]);
  useEffect(() => {
    if (saveState.status === "success") router.refresh();
  }, [router, saveState.status]);

  function updateRequirement(key: string, update: Partial<SavedJobRequirement>) {
    setEditedRequirements((current) => (current ?? shownRequirements).map((requirement) => requirement.key === key ? { ...requirement, ...update, source: "user" } : requirement));
  }

  function addRequirement() {
    setEditedRequirements((current) => [...(current ?? shownRequirements), newRequirement()]);
  }

  function removeRequirement(key: string) {
    setEditedRequirements((current) => (current ?? shownRequirements).filter((requirement) => requirement.key !== key));
  }

  return <section className="job-requirements-editor" aria-labelledby="job-requirements-heading">
    <div className="section-heading"><div><p className="eyebrow">Saved for this vacancy</p><h3 id="job-requirements-heading">CV requirements</h3></div><span className="count-pill">{shownRequirements.length}</span></div>
    <p className="muted">Analyze once, choose the experience level, then reuse this list for every CV generated for this job.</p>
    {shownRequirements.length === 0 && canAnalyze ? <form action={analyzeAction} className="stack"><SubmitButton pendingLabel="Analyzing requirements…">Analyze requirements</SubmitButton><Feedback state={analyzeState} /></form> : null}
    {shownRequirements.length === 0 && !canAnalyze ? <p className="alert alert-error" role="alert">Add a Candidate Profile before analyzing requirements.</p> : null}
    {shownRequirements.length > 0 ? <form action={saveAction} className="stack">
      <div className="job-requirements-list">{shownRequirements.map((requirement) => <div className="job-requirement-row" key={requirement.key}>
        <label><span className="sr-only">Requirement</span><input value={requirement.label} onChange={(event) => updateRequirement(requirement.key, { label: event.target.value })} placeholder="Requirement or skill" maxLength={160} /></label>
        <label><span className="sr-only">Experience level for {requirement.label || "requirement"}</span><select value={requirement.level} onChange={(event) => updateRequirement(requirement.key, { level: event.target.value as JobRequirementLevel })}>{JOB_REQUIREMENT_LEVELS.map((level) => <option value={level} key={level}>{levelLabel(level)}</option>)}</select></label>
        <button type="button" className="icon-button" aria-label={`Delete requirement ${requirement.label || "without label"}`} onClick={() => removeRequirement(requirement.key)}>×</button>
      </div>)}</div>
      <input type="hidden" name="requirements" value={serialized} />
      <input type="hidden" name="analysis" value={serializedAnalysis} />
      <div className="button-row"><button type="button" className="button button-secondary" onClick={addRequirement}>＋ Add requirement</button><SubmitButton pendingLabel="Saving requirements…">Save requirements</SubmitButton></div>
      <Feedback state={saveState.status !== "idle" ? saveState : analyzeState} />
    </form> : null}
  </section>;
}
