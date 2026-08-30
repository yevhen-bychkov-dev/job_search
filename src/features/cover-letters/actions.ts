"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireIdentity } from "@/features/auth/session";
import { ResourceNotFoundError } from "@/lib/data/contracts";
import { reportUnexpectedError } from "@/lib/server-errors";
import { isUuid } from "@/lib/validation";

import { CoverLetterGenerationError, generateCoverLetter, removeGeneratedCoverLetter } from "./service";
import type { CoverLetterActionState } from "./types";

export async function generateCoverLetterAction(jobId: string, _previous: CoverLetterActionState, formData: FormData): Promise<CoverLetterActionState> {
  void _previous;
  const identity = await requireIdentity();
  const requestId = formData.get("requestId");
  if (!isUuid(jobId) || typeof requestId !== "string" || !isUuid(requestId)) return { status: "error", message: "The generation request is invalid. Refresh and try again." };
  try {
    await generateCoverLetter(identity.userId, jobId, requestId);
    revalidatePath(`/jobs/${jobId}`);
    return { status: "success", message: "Cover letter generated." };
  } catch (error) {
    if (error instanceof CoverLetterGenerationError) return { status: "error", message: error.message };
    if (error instanceof ResourceNotFoundError) return { status: "error", message: "The vacancy is no longer available." };
    reportUnexpectedError("cover-letters.action.generate", error);
    return { status: "error", message: "The cover letter could not be generated. Please try again." };
  }
}

export async function deleteGeneratedCoverLetterAction(jobId: string, coverLetterId: string): Promise<void> {
  const identity = await requireIdentity();
  if (!isUuid(jobId) || !isUuid(coverLetterId)) redirect("/jobs?error=invalid-id");
  try {
    await removeGeneratedCoverLetter(identity.userId, jobId, coverLetterId);
  } catch (error) {
    if (!(error instanceof ResourceNotFoundError)) reportUnexpectedError("cover-letters.action.delete", error);
    redirect(`/jobs/${jobId}?error=cover-letter-delete`);
  }
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}?coverLetterDeleted=1`);
}
