import "server-only";

import { candidateProfileForAi } from "@/features/knowledge/candidate-profile";
import { getAppStore } from "@/lib/data/server-store";
import { ResourceNotFoundError } from "@/lib/data/contracts";
import { reportUnexpectedError } from "@/lib/server-errors";

import { createCvAiProvider } from "./ai/factory";
import { CvAiProviderError } from "./ai/provider";
import { matchVacancyAnalysis, materializeResumeContent, parseVacancyAnalysis, savedJobRequirementsFromAnalysis, savedJobRequirementsToAnalysis, validateSavedJobRequirements } from "./domain";
import { renderHtmlToPdf } from "./html-to-pdf";
import { renderResumeTemplate, validateResumeTemplateBytes } from "./template";
import type { GeneratedCv, JobResumeRequirements, ResumeConfirmationLevel, ResumeGeneration } from "./types";

export class MissingCandidateProfileError extends Error {
  constructor() {
    super("Add a valid Candidate Profile JSON in the Knowledge Base before generating a resume.");
    this.name = "MissingCandidateProfileError";
  }
}

export class MissingResumeTemplateError extends Error {
  constructor() {
    super("Configure a valid HTML Resume Template in Account before generating a resume.");
    this.name = "MissingResumeTemplateError";
  }
}

export class MissingJobRequirementsError extends Error {
  constructor() {
    super("Analyze and save the vacancy requirements before generating a resume.");
    this.name = "MissingJobRequirementsError";
  }
}

export class ResumeGenerationError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ResumeGenerationError";
    this.code = code;
  }
}

export type BeginResumeGenerationResult =
  | { kind: "success"; generation: ResumeGeneration; cv: GeneratedCv }
  | { kind: "in_progress"; generation: ResumeGeneration };

function geminiRateLimitMessage(error: CvAiProviderError): string {
  const cause = error.cause;
  const details = typeof cause === "object" && cause !== null
    ? Object.values(cause).filter((value): value is string => typeof value === "string").join(" ").toLocaleLowerCase("en")
    : "";
  if (details.includes("quota") || details.includes("resource_exhausted")) {
    return "Gemini project quota is exhausted (GEMINI_HTTP_429). Check the Gemini project quota/billing or configure a different Gemini project/model.";
  }
  return "Gemini rate limit reached (GEMINI_HTTP_429). The app tried one alternate model and stopped to avoid increasing the limit. Please wait and retry.";
}

function throwGenerationFailure(error: unknown): never {
  if (error instanceof ResumeGenerationError) throw error;
  if (error instanceof CvAiProviderError) {
    reportUnexpectedError("cvs.gemini", error);
    const message = error.code === "GEMINI_CONFIG_MISSING"
      ? "Gemini is not configured for this deployment. Add GEMINI_API_KEY and GEMINI_MODEL."
      : error.code === "GEMINI_HTTP_401" || error.code === "GEMINI_HTTP_403"
        ? "Gemini rejected the configured API credentials. Check GEMINI_API_KEY."
        : error.code === "GEMINI_HTTP_429"
          ? geminiRateLimitMessage(error)
          : error.code.startsWith("GEMINI_HTTP_5")
            ? `Gemini is temporarily unavailable after automatic retries (${error.code}). Please retry.`
            : error.code === "GEMINI_TIMEOUT"
              ? "Gemini did not respond within 60 seconds (GEMINI_TIMEOUT). Please retry."
              : error.code === "GEMINI_NETWORK_FAILURE"
                ? "The Gemini network request failed after automatic retries (GEMINI_NETWORK_FAILURE). Please retry."
                : `Gemini could not produce structured resume content (${error.code}).`;
    throw new ResumeGenerationError(error.code, message, { cause: error });
  }
  throw new ResumeGenerationError("RESUME_GENERATION_FAILED", "Resume generation failed. Please retry.", { cause: error });
}

function jobPayload(job: { title: string; company: string; description: string; technologies: string[] }) {
  return { title: job.title, company: job.company, description: job.description, technologies: [...job.technologies] };
}

async function requiredAnalysisInputs(userId: string, jobId: string) {
  const store = getAppStore();
  const [job, profile] = await Promise.all([
    store.getJob(userId, jobId),
    store.getCandidateProfile(userId),
  ]);
  if (!job) throw new ResourceNotFoundError("Job");
  if (!profile) throw new MissingCandidateProfileError();
  return { store, job, profile };
}

async function requiredGenerationInputs(userId: string, jobId: string) {
  const base = await requiredAnalysisInputs(userId, jobId);
  const template = await base.store.getActiveResumeTemplate(userId);
  if (!template) throw new MissingResumeTemplateError();
  return { ...base, template };
}

async function failGeneration(userId: string, generation: ResumeGeneration, error: unknown): Promise<never> {
  const store = getAppStore();
  const code = error instanceof ResumeGenerationError || error instanceof CvAiProviderError ? error.code : "RESUME_GENERATION_FAILED";
  try {
    await store.updateResumeGeneration(userId, generation.id, { status: "failed", errorCode: code });
  } catch (updateError) {
    // The original failure remains the actionable error. The store update is best-effort observability.
    reportUnexpectedError("cvs.generation.failure-state", updateError);
  }
  return throwGenerationFailure(error);
}

async function finalizeResumeGeneration(
  userId: string,
  generation: ResumeGeneration,
  input: Awaited<ReturnType<typeof requiredGenerationInputs>>,
): Promise<{ generation: ResumeGeneration; cv: GeneratedCv }> {
  const { store, job, profile, template } = input;
  if (!generation.analysis) throw new ResumeGenerationError("ANALYSIS_MISSING", "Resume requirement analysis is missing.");
  try {
    await store.updateResumeGeneration(userId, generation.id, { status: "generating", templateVersion: template.version, errorCode: null });
    const provider = createCvAiProvider();
    const untrustedContent = await provider.generateCv({
      job: jobPayload(job),
      candidate: candidateProfileForAi(profile),
      confirmations: generation.confirmations,
      analysis: generation.analysis,
    });
    const content = materializeResumeContent(profile, untrustedContent, generation.confirmations);
    if (!content.ok) throw new ResumeGenerationError("RESUME_CONTENT_REJECTED", `The generated resume was rejected: ${content.message}`);
    await store.updateResumeGeneration(userId, generation.id, { status: "rendering", templateVersion: template.version });
    const templateFile = await store.downloadResumeTemplate(userId, template.id);
    const parsedTemplate = validateResumeTemplateBytes(templateFile.bytes);
    if (!parsedTemplate.ok) throw new ResumeGenerationError("TEMPLATE_INVALID", parsedTemplate.message);
    const renderedHtml = renderResumeTemplate(parsedTemplate.html, { personal: profile.personal, content: content.data });
    let bytes: Uint8Array;
    try {
      bytes = await renderHtmlToPdf(renderedHtml);
    } catch (error) {
      throw new ResumeGenerationError("PDF_RENDER_UNAVAILABLE", "The PDF renderer is unavailable in this deployment. Configure a Chromium executable with CHROMIUM_PATH and retry.", { cause: error });
    }
    if (bytes.byteLength > 2 * 1024 * 1024) throw new ResumeGenerationError("RESUME_PDF_SIZE_LIMIT", "The generated PDF exceeds the private storage limit.");
    const cv = await store.createGeneratedCv(userId, job.id, { bytes, content: content.data, aiProvider: provider.providerId, aiModel: provider.model, generationId: generation.id, templateVersion: template.version });
    const completed = await store.updateResumeGeneration(userId, generation.id, { status: "completed", templateVersion: template.version, errorCode: null });
    return { generation: completed, cv };
  } catch (error) {
    return failGeneration(userId, generation, error);
  }
}

export async function beginResumeGeneration(userId: string, jobId: string, idempotencyKey: string): Promise<BeginResumeGenerationResult> {
  const input = await requiredGenerationInputs(userId, jobId);
  const savedRequirements = await input.store.getJobResumeRequirements(userId, jobId);
  if (!savedRequirements) throw new MissingJobRequirementsError();
  const generation = await input.store.createResumeGeneration(userId, jobId, idempotencyKey);
  if (generation.status === "completed") {
    const existing = (await input.store.listGeneratedCvs(userId, jobId)).find((cv) => cv.generationId === generation.id);
    if (existing) return { kind: "success", generation, cv: existing };
  }
  if (generation.status === "generating" || generation.status === "rendering") return { kind: "in_progress", generation };
  const analysis = savedJobRequirementsToAnalysis(savedRequirements);
  const confirmations = savedRequirements.requirements
    .filter((requirement) => requirement.level !== "unconfirmed")
    .map((requirement) => ({ key: requirement.key, label: requirement.label, level: requirement.level as ResumeConfirmationLevel, provenance: requirement.source === "ai" ? "existing_kb" as const : "explicit_user_confirmation" as const }));
  const ready = await input.store.updateResumeGeneration(userId, generation.id, { status: "awaiting_confirmation", analysis, confirmations, templateVersion: input.template.version, errorCode: null });
  return finalizeResumeGeneration(userId, ready, input).then(({ generation: completed, cv }) => ({ kind: "success" as const, generation: completed, cv }));
}

export async function analyzeJobRequirements(userId: string, jobId: string): Promise<JobResumeRequirements> {
  const input = await requiredAnalysisInputs(userId, jobId);
  try {
    const provider = createCvAiProvider();
    const untrustedAnalysis = await provider.analyzeVacancy({ job: jobPayload(input.job), candidate: candidateProfileForAi(input.profile), confirmations: [] });
    const parsed = parseVacancyAnalysis(untrustedAnalysis);
    if (!parsed.ok) throw new ResumeGenerationError("VACANCY_ANALYSIS_REJECTED", `Vacancy analysis was rejected: ${parsed.message}`);
    const analysis = matchVacancyAnalysis(parsed.data, input.profile, []);
    return { analysis, requirements: savedJobRequirementsFromAnalysis(analysis), updatedAt: new Date().toISOString() };
  } catch (error) {
    return throwGenerationFailure(error);
  }
}

export async function saveJobRequirements(userId: string, jobId: string, rawAnalysis: unknown, rawRequirements: unknown): Promise<JobResumeRequirements> {
  const store = getAppStore();
  if (!(await store.getJob(userId, jobId))) throw new ResourceNotFoundError("Job");
  const parsedAnalysis = parseVacancyAnalysis(rawAnalysis);
  if (!parsedAnalysis.ok) throw new ResumeGenerationError("JOB_REQUIREMENTS_INVALID", parsedAnalysis.message);
  const parsed = validateSavedJobRequirements(rawRequirements);
  if (!parsed.ok) throw new ResumeGenerationError("JOB_REQUIREMENTS_INVALID", parsed.message);
  return store.saveJobResumeRequirements(userId, jobId, { analysis: savedJobRequirementsToAnalysis({ analysis: parsedAnalysis.data, requirements: parsed.data, updatedAt: new Date().toISOString() }), requirements: parsed.data });
}
