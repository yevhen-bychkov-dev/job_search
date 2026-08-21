"use server";

import { revalidatePath } from "next/cache";

import { requireIdentity } from "@/features/auth/session";
import { ResourceNotFoundError } from "@/lib/data/contracts";
import { getAppStore } from "@/lib/data/server-store";
import { reportUnexpectedError } from "@/lib/server-errors";
import { isUuid } from "@/lib/validation";

import { beginResumeGeneration, confirmAndGenerateResume, MissingCandidateProfileError, MissingResumeTemplateError, ResumeGenerationError } from "./service";
import type { CvActionState } from "./types";

function failure(operation: string, error: unknown): CvActionState {
  if (error instanceof MissingCandidateProfileError || error instanceof MissingResumeTemplateError || error instanceof ResumeGenerationError) return { status: "error", message: error.message };
  if (error instanceof ResourceNotFoundError) return { status: "error", message: "The vacancy or generation is no longer available." };
  reportUnexpectedError(operation, error);
  return { status: "error", message: "The resume could not be generated. Please try again." };
}

export async function generateCvAction(jobId: string, _previous: CvActionState, formData: FormData): Promise<CvActionState> {
  const identity = await requireIdentity();
  if (!isUuid(jobId)) return { status: "error", message: "Invalid job identifier." };
  const idempotencyKey = formData.get("idempotencyKey");
  if (typeof idempotencyKey !== "string" || !isUuid(idempotencyKey)) return { status: "error", message: "The generation request is invalid. Refresh and try again." };
  try {
    const result = await beginResumeGeneration(identity.userId, jobId, idempotencyKey);
    if (result.kind === "confirmation") return { status: "confirmation", message: "Confirm the important vacancy requirements before generating the final resume.", generationId: result.generation.id, questions: result.questions };
    if (result.kind === "in_progress") return { status: "success", message: "Resume generation is already in progress. You can leave this page and return later." };
    revalidatePath(`/jobs/${jobId}`);
    return { status: "success", message: `Resume #${result.cv.version} generated.` };
  } catch (error) {
    return failure("cvs.generate", error);
  }
}

export async function confirmCvAction(generationId: string, _previous: CvActionState, formData: FormData): Promise<CvActionState> {
  const identity = await requireIdentity();
  if (!isUuid(generationId)) return { status: "error", message: "Invalid generation identifier." };
  const rawAnswers = formData.get("answers");
  if (typeof rawAnswers !== "string" || rawAnswers.length > 20_000) return { status: "error", message: "The confirmation answers are invalid." };
  let answers: Array<{ key: string; level: "commercial" | "familiar" | "none" }>;
  try {
    const parsed: unknown = JSON.parse(rawAnswers);
    if (!Array.isArray(parsed)) throw new Error("not-array");
    answers = parsed as Array<{ key: string; level: "commercial" | "familiar" | "none" }>;
  } catch {
    return { status: "error", message: "The confirmation answers are invalid." };
  }
  try {
    const jobId = (await getAppStore().getResumeGeneration(identity.userId, generationId))?.jobId ?? null;
    const cv = await confirmAndGenerateResume(identity.userId, generationId, answers);
    if (jobId) revalidatePath(`/jobs/${jobId}`);
    return { status: "success", message: `Resume #${cv.version} generated.` };
  } catch (error) {
    return failure("cvs.confirm", error);
  }
}
