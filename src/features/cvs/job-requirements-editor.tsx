"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { SubmitButton } from "@/components/ui/submit-button";

import { analyzeRequirementsAction, saveRequirementsAction } from "./actions";
import { GenerateCvForm } from "./generate-cv-form";
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

function approvalComparable(requirements: SavedJobRequirement[]): string {
  return JSON.stringify(requirements.map(({ key, label, category, importance, section, level }) => ({ key, label, category, importance, section, level })));
}

export function JobRequirementsEditor({ jobId, initialAnalysis, initialRequirements, initialApprovedAt, canAnalyze, hasResumeTemplate }: { jobId: string; initialAnalysis: VacancyAnalysis | null; initialRequirements: SavedJobRequirement[]; initialApprovedAt: string | null; canAnalyze: boolean; hasResumeTemplate: boolean }) {
  const router = useRouter();
  const [requirements] = useState(initialRequirements);
  const [editedRequirements, setEditedRequirements] = useState<SavedJobRequirement[] | null>(null);
  const [analyzeState, analyzeAction] = useActionState(analyzeRequirementsAction.bind(null, jobId), INITIAL_REQUIREMENTS_ACTION_STATE);
  const [saveState, saveAction] = useActionState(saveRequirementsAction.bind(null, jobId), INITIAL_REQUIREMENTS_ACTION_STATE);
  const shownRequirements = editedRequirements ?? analyzeState.requirements ?? saveState.requirements ?? requirements;
  const analysis = analyzeState.analysis ?? saveState.analysis ?? initialAnalysis;
  const serialized = useMemo(() => JSON.stringify(shownRequirements), [shownRequirements]);
  const serializedAnalysis = useMemo(() => JSON.stringify(analysis), [analysis]);
  const approvedRequirements = saveState.requirements ?? initialRequirements;
  const approvedAt = saveState.approvedAt ?? (analyzeState.status === "success" ? null : initialApprovedAt);
  const hasUnsavedChanges = approvalComparable(shownRequirements) !== approvalComparable(approvedRequirements);
  const hasApprovedSkills = shownRequirements.length > 0 && shownRequirements.every((requirement) => requirement.level !== "unconfirmed");
  const canGenerate = hasResumeTemplate && Boolean(approvedAt) && hasApprovedSkills && !hasUnsavedChanges;
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
    <div className="section-heading"><div><p className="eyebrow">Saved for this vacancy</p><h3 id="job-requirements-heading">Approved resume skills</h3></div><span className="count-pill">{shownRequirements.length}</span></div>
    <p className="muted">Gemini extracts vacancy-only suggestions. The app matches them to your verified Candidate Profile; you make the final approval decision.</p>
    {shownRequirements.length === 0 && canAnalyze ? <form action={analyzeAction} className="stack"><SubmitButton pendingLabel="Analyzing vacancy skills…">Analyze job &amp; suggest skills</SubmitButton><Feedback state={analyzeState} /></form> : null}
    {shownRequirements.length === 0 && !canAnalyze ? <p className="alert alert-error" role="alert">Add a Candidate Profile before analyzing vacancy skills.</p> : null}
    {shownRequirements.length > 0 ? <form action={saveAction} className="stack">
      <div className="job-requirements-list">{shownRequirements.map((requirement) => <div className="job-requirement-row" key={requirement.key}>
        <label><span className="sr-only">Skill</span><input value={requirement.label} onChange={(event) => updateRequirement(requirement.key, { label: event.target.value })} placeholder="Vacancy skill" maxLength={160} /></label>
        <label><span className="sr-only">Experience level for {requirement.label || "skill"}</span><select value={requirement.level} onChange={(event) => updateRequirement(requirement.key, { level: event.target.value as JobRequirementLevel })}>{JOB_REQUIREMENT_LEVELS.map((level) => <option value={level} key={level}>{levelLabel(level)}</option>)}</select></label>
        <button type="button" className="icon-button" aria-label={`Delete skill ${requirement.label || "without label"}`} onClick={() => removeRequirement(requirement.key)}>×</button>
      </div>)}</div>
      <input type="hidden" name="requirements" value={serialized} />
      <input type="hidden" name="analysis" value={serializedAnalysis} />
      <div className="button-row"><button type="button" className="button button-secondary" onClick={addRequirement}>＋ Add skill</button><SubmitButton pendingLabel="Approving skills…">Approve skills</SubmitButton></div>
      <Feedback state={saveState} />
    </form> : null}
    {shownRequirements.length > 0 && canAnalyze ? <form action={analyzeAction} className="stack"><SubmitButton pendingLabel="Reanalyzing vacancy skills…">Reanalyze suggestions</SubmitButton><Feedback state={analyzeState} /></form> : null}
    <GenerateCvForm jobId={jobId} canGenerate={canGenerate} disabledReason={!hasResumeTemplate ? "Upload an HTML template in Account first." : !approvedAt || !hasApprovedSkills ? "Approve every skill before generating." : hasUnsavedChanges ? "Approve your latest skill edits before generating." : undefined} />
  </section>;
}
