"use server";

import { revalidatePath } from "next/cache";

import { requireIdentity } from "@/features/auth/session";
import { ResourceNotFoundError } from "@/lib/data/contracts";
import { reportUnexpectedError } from "@/lib/server-errors";
import { isUuid } from "@/lib/validation";

import { generateCvForJob, MissingCandidateProfileError } from "./service";
import type { CvActionState } from "./types";

export async function generateCvAction(
  jobId: string,
  _previous: CvActionState,
  _formData: FormData,
): Promise<CvActionState> {
  void _previous;
  void _formData;
  const identity = await requireIdentity();
  if (!isUuid(jobId)) return { status: "error", message: "Invalid job identifier." };
  try {
    const cv = await generateCvForJob(identity.userId, jobId);
    revalidatePath(`/jobs/${jobId}`);
    return { status: "success", message: `CV #${cv.version} generated.` };
  } catch (error) {
    if (error instanceof MissingCandidateProfileError) {
      return { status: "error", message: error.message };
    }
    if (error instanceof ResourceNotFoundError) {
      return { status: "error", message: "This job is no longer available." };
    }
    reportUnexpectedError("cvs.generate", error);
    return { status: "error", message: "Could not generate CV. Please try again." };
  }
}
