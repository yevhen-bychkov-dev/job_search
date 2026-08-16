import "server-only";

import { candidateProfileForAi } from "@/features/knowledge/candidate-profile";
import { getAppStore } from "@/lib/data/server-store";
import { ResourceNotFoundError } from "@/lib/data/contracts";

import { createCvAiProvider } from "./ai/factory";
import { materializeGeneratedCv } from "./domain";
import { renderCvPdf } from "./pdf";
import type { GeneratedCv } from "./types";

export class MissingCandidateProfileError extends Error {
  constructor() {
    super("Add a valid Candidate Profile in the Knowledge Base before generating a CV.");
    this.name = "MissingCandidateProfileError";
  }
}

class CvGenerationError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CvGenerationError";
    this.code = code;
  }
}

export async function generateCvForJob(userId: string, jobId: string): Promise<GeneratedCv> {
  const store = getAppStore();
  const [job, profile] = await Promise.all([
    store.getJob(userId, jobId),
    store.getCandidateProfile(userId),
  ]);
  if (!job) throw new ResourceNotFoundError("Job");
  if (!profile) throw new MissingCandidateProfileError();
  const provider = createCvAiProvider();
  const untrustedSelection = await provider.generateCv({
    job: {
      title: job.title,
      company: job.company,
      description: job.description,
      technologies: [...job.technologies],
    },
    candidate: candidateProfileForAi(profile),
  });
  const content = materializeGeneratedCv(profile, untrustedSelection);
  if (!content.ok) throw new CvGenerationError("CV_SELECTION_REJECTED", `Gemini CV selection was rejected: ${content.message}`);
  let bytes: Uint8Array;
  try {
    bytes = renderCvPdf({ personal: profile.personal, content: content.data });
  } catch (error) {
    throw new CvGenerationError("CV_PDF_RENDER_FAILED", "Generated CV PDF rendering failed.", { cause: error });
  }
  if (bytes.byteLength > 2 * 1024 * 1024) throw new CvGenerationError("CV_PDF_SIZE_LIMIT", "Generated CV PDF exceeds the private bucket limit.");
  try {
    return await store.createGeneratedCv(userId, jobId, {
      bytes,
      content: content.data,
      aiProvider: provider.providerId,
      aiModel: provider.model,
    });
  } catch (error) {
    throw new CvGenerationError("CV_PERSISTENCE_FAILED", "Generated CV persistence failed.", { cause: error });
  }
}
