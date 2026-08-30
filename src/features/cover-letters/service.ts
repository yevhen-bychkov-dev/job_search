import "server-only";

import { candidateProfileForAi } from "@/features/knowledge/candidate-profile";
import { createCvAiProvider } from "@/features/cvs/ai/factory";
import { CvAiProviderError } from "@/features/cvs/ai/provider";
import { renderHtmlToPdf, PdfRenderError } from "@/features/cvs/html-to-pdf";
import { ArtifactPersistenceError, DatabaseMigrationRequiredError, ResourceNotFoundError } from "@/lib/data/contracts";
import { getAppStore } from "@/lib/data/server-store";
import { reportUnexpectedError } from "@/lib/server-errors";

import { materializeCoverLetterContent, renderCoverLetterHtml } from "./domain";
import type { GeneratedCoverLetter } from "./types";

const MAX_PDF_BYTES = 2 * 1024 * 1024;

export class CoverLetterGenerationError extends Error {
  readonly code: string;
  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CoverLetterGenerationError";
    this.code = code;
  }
}

function providerMessage(error: CvAiProviderError): string {
  if (error.code === "GEMINI_CONFIG_MISSING") return "Gemini is not configured. Add GEMINI_API_KEY and GEMINI_MODEL.";
  if (error.code === "GEMINI_HTTP_401" || error.code === "GEMINI_HTTP_403") return "Gemini rejected the configured credentials. Check GEMINI_API_KEY.";
  if (error.code === "GEMINI_HTTP_429") return "Gemini is rate-limited or out of quota. Retry after the provider limit resets.";
  if (/^GEMINI_HTTP_5\d\d$/.test(error.code)) return "Gemini is temporarily unavailable. Retry later.";
  return `Gemini could not produce valid cover-letter content (${error.code}).`;
}

function normalizeError(error: unknown): CoverLetterGenerationError {
  if (error instanceof CoverLetterGenerationError) return error;
  if (error instanceof CvAiProviderError) return new CoverLetterGenerationError(error.code, providerMessage(error), { cause: error });
  if (error instanceof PdfRenderError) return new CoverLetterGenerationError(error.code, `The cover-letter PDF could not be rendered (${error.code}).`, { cause: error });
  if (error instanceof ArtifactPersistenceError) return new CoverLetterGenerationError(`COVER_LETTER_${error.stage.toUpperCase()}_FAILED`, "The cover-letter PDF could not be stored safely. Please try again.", { cause: error });
  if (error instanceof DatabaseMigrationRequiredError) return new CoverLetterGenerationError("DATABASE_MIGRATION_REQUIRED", error.message, { cause: error });
  reportUnexpectedError("cover-letters.generate", error);
  return new CoverLetterGenerationError("COVER_LETTER_GENERATION_FAILED", "The cover letter could not be generated. Please try again.", { cause: error });
}

export async function generateCoverLetter(userId: string, jobId: string, requestId: string): Promise<GeneratedCoverLetter> {
  const store = getAppStore();
  const existing = await store.getGeneratedCoverLetterByRequestId(userId, jobId, requestId);
  if (existing) return existing;
  const [job, profile] = await Promise.all([store.getJob(userId, jobId), store.getCandidateProfile(userId)]);
  if (!job) throw new ResourceNotFoundError("Job");
  if (!profile) throw new CoverLetterGenerationError("CANDIDATE_PROFILE_MISSING", "Add a valid Candidate Profile JSON in the Knowledge Base before generating a cover letter.");
  if (!job.description.trim()) throw new CoverLetterGenerationError("VACANCY_DESCRIPTION_MISSING", "Add the vacancy description before generating a cover letter.");
  try {
    const provider = createCvAiProvider();
    const raw = await provider.generateCoverLetter({
      job: { title: job.title, company: job.company, description: job.description, technologies: [...job.technologies] },
      candidate: candidateProfileForAi(profile),
    }, { jobId, stage: "cover_letter" });
    const parsed = materializeCoverLetterContent(profile, raw);
    if (!parsed.ok) throw new CoverLetterGenerationError("COVER_LETTER_CONTENT_REJECTED", parsed.message);
    const bytes = await renderHtmlToPdf(renderCoverLetterHtml({ content: parsed.data, candidate: profile.personal, job, generatedAt: new Date() }));
    if (bytes.byteLength > MAX_PDF_BYTES) throw new CoverLetterGenerationError("COVER_LETTER_PDF_SIZE_LIMIT", "The generated cover-letter PDF exceeds the 2 MB private-storage limit.");
    return await store.createGeneratedCoverLetter(userId, jobId, { bytes, content: parsed.data, aiProvider: provider.providerId, aiModel: provider.model, requestId });
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function removeGeneratedCoverLetter(userId: string, jobId: string, coverLetterId: string): Promise<void> {
  await getAppStore().deleteGeneratedCoverLetter(userId, jobId, coverLetterId);
}
