"use server";

import { revalidatePath } from "next/cache";

import { requireIdentity } from "@/features/auth/session";
import { ResourceNotFoundError } from "@/lib/data/contracts";
import { reportUnexpectedError } from "@/lib/server-errors";
import { isUuid } from "@/lib/validation";

import { analyzeJobRequirements, beginResumeGeneration, MissingCandidateProfileError, MissingJobRequirementsError, MissingResumeTemplateError, renderResumeGeneration, ResumeGenerationError, saveJobRequirements } from "./service";
import type { CvActionState, RequirementsActionState } from "./types";

function failure(operation: string, error: unknown): CvActionState {
  if (error instanceof MissingCandidateProfileError || error instanceof MissingJobRequirementsError || error instanceof MissingResumeTemplateError || error instanceof ResumeGenerationError) return { status: "error", message: error.message };
  if (error instanceof ResourceNotFoundError) return { status: "error", message: "The vacancy or generation is no longer available." };
  reportUnexpectedError(operation, error);
  return { status: "error", message: "The resume could not be generated. Please try again." };
}

function requirementsFailure(operation: string, error: unknown): RequirementsActionState {
  if (error instanceof MissingCandidateProfileError || error instanceof MissingJobRequirementsError || error instanceof ResumeGenerationError) return { status: "error", message: error.message };
  if (error instanceof ResourceNotFoundError) return { status: "error", message: "The vacancy is no longer available." };
  reportUnexpectedError(operation, error);
  return { status: "error", message: "The vacancy requirements could not be saved. Please try again." };
}

export async function analyzeRequirementsAction(jobId: string, _previous: RequirementsActionState, _formData: FormData): Promise<RequirementsActionState> {
  void _previous;
  void _formData;
  const identity = await requireIdentity();
  if (!isUuid(jobId)) return { status: "error", message: "Invalid job identifier." };
  try {
    const analyzed = await analyzeJobRequirements(identity.userId, jobId);
    revalidatePath(`/jobs/${jobId}`);
    return { status: "success", message: "Skill suggestions are saved as a draft. Review, edit, and approve them before generating.", analysis: analyzed.analysis, requirements: analyzed.requirements, approvedAt: null };
  } catch (error) {
    return requirementsFailure("cvs.requirements.analyze", error);
  }
}

export async function saveRequirementsAction(jobId: string, _previous: RequirementsActionState, formData: FormData): Promise<RequirementsActionState> {
  const identity = await requireIdentity();
  if (!isUuid(jobId)) return { status: "error", message: "Invalid job identifier." };
  const rawRequirements = formData.get("requirements");
  const rawAnalysis = formData.get("analysis");
  if (typeof rawRequirements !== "string" || rawRequirements.length > 100_000 || typeof rawAnalysis !== "string" || rawAnalysis.length > 200_000) return { status: "error", message: "The job requirements list is invalid." };
  let parsedRequirements: unknown;
  let parsedAnalysis: unknown;
  try {
    parsedRequirements = JSON.parse(rawRequirements) as unknown;
    parsedAnalysis = JSON.parse(rawAnalysis) as unknown;
  } catch {
    return { status: "error", message: "The job requirements list is invalid." };
  }
  try {
    const saved = await saveJobRequirements(identity.userId, jobId, parsedAnalysis, parsedRequirements);
    revalidatePath(`/jobs/${jobId}`);
    return { status: "success", message: "Skills approved for resume generation.", requirements: saved.requirements, analysis: saved.analysis, approvedAt: saved.approvedAt };
  } catch (error) {
    return requirementsFailure("cvs.requirements.save", error);
  }
}

export async function generateCvAction(jobId: string, _previous: CvActionState, formData: FormData): Promise<CvActionState> {
  const identity = await requireIdentity();
  if (!isUuid(jobId)) return { status: "error", message: "Invalid job identifier." };
  const idempotencyKey = formData.get("idempotencyKey");
  if (typeof idempotencyKey !== "string" || !isUuid(idempotencyKey)) return { status: "error", message: "The generation request is invalid. Refresh and try again." };
  try {
    const result = await beginResumeGeneration(identity.userId, jobId, idempotencyKey);
    if (result.kind === "in_progress") return { status: "in_progress", message: "Another request owns this generation stage. Wait a moment, then retry.", generationId: result.generation.id, stage: result.generation.currentStage ?? "generation" };
    if (result.kind === "ready_to_render") return { status: "ready_to_render", message: "Structured resume content is ready. Rendering the PDF…", generationId: result.generation.id, stage: "render" };
    revalidatePath(`/jobs/${jobId}`);
    return { status: "success", message: `Resume #${result.cv.version} generated.`, generationId: result.generation.id, stage: "render" };
  } catch (error) {
    return failure("cvs.generate", error);
  }
}

export async function renderCvAction(jobId: string, _previous: CvActionState, formData: FormData): Promise<CvActionState> {
  const identity = await requireIdentity();
  if (!isUuid(jobId)) return { status: "error", message: "Invalid job identifier.", stage: "render" };
  const generationId = formData.get("generationId");
  if (typeof generationId !== "string" || !isUuid(generationId)) return { status: "error", message: "The render request is invalid. Refresh and try again.", stage: "render" };
  try {
    const result = await renderResumeGeneration(identity.userId, jobId, generationId);
    if (result.kind === "in_progress") return { status: "in_progress", message: "Another request is rendering this PDF. Wait a moment, then retry.", generationId, stage: "render" };
    revalidatePath(`/jobs/${jobId}`);
    return { status: "success", message: `Resume #${result.cv.version} generated.`, generationId, stage: "render" };
  } catch (error) {
    const state = failure("cvs.render", error);
    return { ...state, generationId, stage: "render" };
  }
}
