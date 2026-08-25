import "server-only";

import { candidateProfileForAi } from "@/features/knowledge/candidate-profile";
import { ArtifactPersistenceError, DatabaseMigrationRequiredError, ResourceNotFoundError } from "@/lib/data/contracts";
import { getAppStore } from "@/lib/data/server-store";
import { reportUnexpectedError } from "@/lib/server-errors";

import { createCvAiProvider } from "./ai/factory";
import { CvAiProviderError } from "./ai/provider";
import {
  approvedSkillsFromRequirements,
  approvedSkillSnapshotsEqual,
  materializeResumeContent,
  materializeVacancyAnalysis,
  parseVacancyAnalysis,
  savedJobRequirementsFromAnalysis,
  savedJobRequirementsToAnalysis,
  validateRequirementApproval,
  validateSavedJobRequirements,
} from "./domain";
import { PdfRenderError, renderHtmlToPdf } from "./html-to-pdf";
import { renderResumeTemplate, validateResumeTemplateBytes } from "./template";
import type { GeneratedCv, JobResumeRequirements, ResumeAiStage, ResumeGeneration } from "./types";

export class MissingCandidateProfileError extends Error {
  constructor() { super("Add a valid Candidate Profile JSON in the Knowledge Base before generating a resume."); this.name = "MissingCandidateProfileError"; }
}
export class MissingResumeTemplateError extends Error {
  constructor() { super("Configure a valid HTML Resume Template in Account before generating a resume."); this.name = "MissingResumeTemplateError"; }
}
export class MissingJobRequirementsError extends Error {
  constructor() { super("Analyze and approve the vacancy skills before generating a resume."); this.name = "MissingJobRequirementsError"; }
}
export class ResumeGenerationError extends Error {
  readonly code: string;
  readonly stage: ResumeAiStage;
  constructor(code: string, message: string, stage: ResumeAiStage, options?: ErrorOptions) { super(message, options); this.name = "ResumeGenerationError"; this.code = code; this.stage = stage; }
}

export type BeginResumeGenerationResult =
  | { kind: "ready_to_render"; generation: ResumeGeneration }
  | { kind: "in_progress"; generation: ResumeGeneration }
  | { kind: "success"; generation: ResumeGeneration; cv: GeneratedCv };
export type RenderResumeGenerationResult =
  | { kind: "in_progress"; generation: ResumeGeneration }
  | { kind: "success"; generation: ResumeGeneration; cv: GeneratedCv };

const LEASE_MS = 90_000;
const MAX_PDF_BYTES = 2 * 1024 * 1024;
const ACTIVE_STATUSES = new Set(["analyzing", "awaiting_confirmation", "strategizing", "generating", "critiquing", "correcting", "rendering", "retrying"]);

function jobPayload(job: { title: string; company: string; description: string; technologies: string[] }) {
  return { title: job.title, company: job.company, description: job.description, technologies: [...job.technologies] };
}
function leaseExpiresAt(): string { return new Date(Date.now() + LEASE_MS).toISOString(); }
function hasLiveLease(generation: ResumeGeneration): boolean { return Boolean(generation.leaseExpiresAt && Date.parse(generation.leaseExpiresAt) > Date.now()); }

async function requiredAnalysisInputs(userId: string, jobId: string) {
  const store = getAppStore();
  const [job, profile] = await Promise.all([store.getJob(userId, jobId), store.getCandidateProfile(userId)]);
  if (!job) throw new ResourceNotFoundError("Job");
  if (!profile) throw new MissingCandidateProfileError();
  return { store, job, profile };
}

async function requiredContentInputs(userId: string, jobId: string) {
  const base = await requiredAnalysisInputs(userId, jobId);
  const [template, requirements] = await Promise.all([
    base.store.getActiveResumeTemplate(userId),
    base.store.getJobResumeRequirements(userId, jobId),
  ]);
  if (!template) throw new MissingResumeTemplateError();
  if (!requirements?.approvedAt) throw new MissingJobRequirementsError();
  const approvalError = validateRequirementApproval(requirements.requirements);
  if (approvalError) throw new ResumeGenerationError("SKILLS_NOT_APPROVED", approvalError, "generation");
  return { ...base, template, requirements };
}

function geminiMessage(error: CvAiProviderError): string {
  if (error.code === "GEMINI_CONFIG_MISSING") return "Gemini is not configured. Add GEMINI_API_KEY and GEMINI_MODEL.";
  if (error.code === "GEMINI_CV_MODEL_TOO_WEAK") return "Final CV writing requires a supported full Gemini Flash model. Set GEMINI_MODEL=gemini-3.6-flash and keep Flash-Lite only in GEMINI_ANALYSIS_MODEL.";
  if (error.code === "GEMINI_HTTP_401" || error.code === "GEMINI_HTTP_403") return "Gemini rejected the configured credentials. Check GEMINI_API_KEY.";
  if (error.code === "GEMINI_HTTP_429") return "Gemini is rate-limited or out of quota (GEMINI_HTTP_429). This request was not automatically repeated; retry after the provider limit resets.";
  if (error.code === "GEMINI_HTTP_400") return "Gemini rejected the structured-output request (GEMINI_HTTP_400). This error is not retryable; verify the deployed application version and Gemini model configuration.";
  if (/^GEMINI_HTTP_5\d\d$/.test(error.code)) return `Gemini is temporarily unavailable after one bounded retry (${error.code}). Retry this stage later.`;
  if (error.code === "GEMINI_NETWORK_FAILURE") return "The Gemini request did not complete (GEMINI_NETWORK_FAILURE). No automatic retry was made because Gemini did not return a retryable HTTP response.";
  if (error.code === "GEMINI_TRUNCATED_RESPONSE") return "Gemini stopped before completing the structured resume. Retry content generation.";
  return `Gemini could not produce valid structured output (${error.code}).`;
}

function normalizeFailure(error: unknown, stage: ResumeAiStage): ResumeGenerationError {
  if (error instanceof ResumeGenerationError) return error;
  if (error instanceof CvAiProviderError) {
    reportUnexpectedError("cvs.gemini", error);
    return new ResumeGenerationError(error.code, geminiMessage(error), stage, { cause: error });
  }
  if (error instanceof PdfRenderError) return new ResumeGenerationError(error.code, `The PDF rendering stage failed (${error.code}). The generated resume content was preserved; retry rendering.`, "render", { cause: error });
  if (error instanceof ArtifactPersistenceError) {
    const message = error.stage === "upload"
      ? "The PDF was created but private storage upload failed. Retry rendering; resume content was preserved."
      : error.stage === "metadata"
        ? "The PDF upload completed but its history record could not be saved. Cleanup was attempted; retry rendering."
        : "The PDF history write failed and temporary storage cleanup also failed. Retry later; an administrator should inspect private storage.";
    return new ResumeGenerationError(`CV_${error.stage.toLocaleUpperCase("en")}_FAILED`, message, "render", { cause: error });
  }
  if (error instanceof DatabaseMigrationRequiredError) return new ResumeGenerationError("DATABASE_MIGRATION_REQUIRED", error.message, stage, { cause: error });
  reportUnexpectedError(`cvs.${stage}`, error);
  return new ResumeGenerationError(stage === "render" ? "RESUME_RENDER_FAILED" : "RESUME_GENERATION_FAILED", stage === "render" ? "The resume could not be rendered. Generated content was preserved; retry rendering." : "Resume content generation failed. Retry this stage.", stage, { cause: error });
}

function retryEligibility(error: unknown): string | null {
  if (!(error instanceof CvAiProviderError) || error.code !== "GEMINI_HTTP_429" || typeof error.cause !== "object" || error.cause === null || !("retryAfter" in error.cause) || typeof error.cause.retryAfter !== "string") return null;
  const seconds = Number(error.cause.retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return new Date(Date.now() + seconds * 1_000).toISOString();
  const timestamp = Date.parse(error.cause.retryAfter);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

async function persistFailure(userId: string, generation: ResumeGeneration, stage: ResumeAiStage, error: unknown): Promise<never> {
  const normalized = normalizeFailure(error, stage);
  try {
    await getAppStore().updateResumeGeneration(userId, generation.id, {
      status: normalized.code === "GEMINI_HTTP_429" ? "rate_limited" : "failed",
      currentStage: stage,
      attemptCount: generation.attemptCount + 1,
      nextRetryAt: retryEligibility(error),
      leaseExpiresAt: null,
      errorCode: normalized.code,
    });
  } catch (persistenceError) {
    reportUnexpectedError("cvs.generation.failure-state", persistenceError);
  }
  throw normalized;
}

async function existingCv(userId: string, jobId: string, generationId: string): Promise<GeneratedCv | null> {
  return (await getAppStore().listGeneratedCvs(userId, jobId)).find((cv) => cv.generationId === generationId) ?? null;
}

export async function analyzeJobRequirements(userId: string, jobId: string): Promise<JobResumeRequirements> {
  const input = await requiredAnalysisInputs(userId, jobId);
  try {
    const provider = createCvAiProvider();
    const raw = await provider.analyzeVacancy({ job: jobPayload(input.job) }, { jobId, stage: "analysis" });
    const parsed = materializeVacancyAnalysis(raw, jobPayload(input.job), input.profile);
    if (!parsed.ok) throw new ResumeGenerationError("VACANCY_ANALYSIS_REJECTED", `The skill suggestions were rejected: ${parsed.message}`, "generation");
    return input.store.saveJobResumeRequirements(userId, jobId, {
      analysis: parsed.data,
      requirements: savedJobRequirementsFromAnalysis(parsed.data),
      approvedAt: null,
    });
  } catch (error) {
    throw normalizeFailure(error, "generation");
  }
}

export async function saveJobRequirements(userId: string, jobId: string, rawAnalysis: unknown, rawRequirements: unknown): Promise<JobResumeRequirements> {
  const store = getAppStore();
  if (!(await store.getJob(userId, jobId))) throw new ResourceNotFoundError("Job");
  const parsedAnalysis = parseVacancyAnalysis(rawAnalysis);
  if (!parsedAnalysis.ok) throw new ResumeGenerationError("JOB_REQUIREMENTS_INVALID", parsedAnalysis.message, "generation");
  const parsed = validateSavedJobRequirements(rawRequirements);
  if (!parsed.ok) throw new ResumeGenerationError("JOB_REQUIREMENTS_INVALID", parsed.message, "generation");
  const approvalError = validateRequirementApproval(parsed.data);
  if (approvalError) throw new ResumeGenerationError("SKILLS_NOT_APPROVED", approvalError, "generation");
  const approvedAt = new Date().toISOString();
  return store.saveJobResumeRequirements(userId, jobId, {
    analysis: savedJobRequirementsToAnalysis({ analysis: parsedAnalysis.data, requirements: parsed.data, updatedAt: approvedAt, approvedAt }),
    requirements: parsed.data,
    approvedAt,
  });
}

export async function beginResumeGeneration(userId: string, jobId: string, idempotencyKey: string): Promise<BeginResumeGenerationResult> {
  const input = await requiredContentInputs(userId, jobId);
  const approvedSkills = approvedSkillsFromRequirements(input.requirements.requirements);
  const analysis = savedJobRequirementsToAnalysis(input.requirements);
  let generation = await input.store.getLatestResumeGeneration(userId, jobId);

  if (generation?.status === "completed") {
    const cv = await existingCv(userId, jobId, generation.id);
    if (cv && generation.idempotencyKey === idempotencyKey) return { kind: "success", generation, cv };
    generation = null;
  }
  if (generation && ACTIVE_STATUSES.has(generation.status) && hasLiveLease(generation)) return { kind: "in_progress", generation };
  if (generation && generation.nextRetryAt && Date.parse(generation.nextRetryAt) > Date.now()) {
    throw new ResumeGenerationError("RETRY_NOT_READY", `Gemini asked this request to wait until ${new Date(generation.nextRetryAt).toLocaleString("en-GB", { timeZone: "Europe/Warsaw" })}.`, "generation");
  }
  if (generation && generation.approvedSkills.length > 0 && !approvedSkillSnapshotsEqual(generation.approvedSkills, approvedSkills)) {
    if (ACTIVE_STATUSES.has(generation.status)) await input.store.updateResumeGeneration(userId, generation.id, { status: "cancelled", leaseExpiresAt: null, errorCode: "APPROVED_SKILLS_CHANGED" });
    generation = null;
  }
  if (generation?.generatedContent && approvedSkillSnapshotsEqual(generation.approvedSkills, approvedSkills)) return { kind: "ready_to_render", generation };
  if (!generation || generation.status === "completed" || generation.status === "cancelled") generation = await input.store.createResumeGeneration(userId, jobId, idempotencyKey);
  if (generation.generatedContent) return { kind: "ready_to_render", generation };
  if (hasLiveLease(generation)) return { kind: "in_progress", generation };

  const claimed = await input.store.claimResumeGeneration(userId, generation.id, {
    expectedUpdatedAt: generation.updatedAt,
    status: "generating",
    currentStage: "generation",
    leaseExpiresAt: leaseExpiresAt(),
    analysis,
    approvedSkills,
    templateVersion: input.template.version,
  });
  if (!claimed) return { kind: "in_progress", generation: (await input.store.getResumeGeneration(userId, generation.id)) ?? generation };
  generation = claimed;

  try {
    const provider = createCvAiProvider();
    const raw = await provider.generateCv({
      job: jobPayload(input.job),
      candidate: candidateProfileForAi(input.profile),
      analysis,
      approvedSkills,
    }, { generationId: generation.id, jobId, stage: "generation" });
    const materialized = materializeResumeContent(input.profile, raw, approvedSkills);
    if (!materialized.ok) throw new ResumeGenerationError("RESUME_CONTENT_REJECTED", `The structured resume was rejected: ${materialized.message}`, "generation");
    const ready = await input.store.updateResumeGeneration(userId, generation.id, {
      status: "rendering",
      generatedContent: materialized.data,
      currentStage: "render",
      attemptCount: 0,
      nextRetryAt: null,
      leaseExpiresAt: null,
      errorCode: null,
      aiProvider: provider.providerId,
      aiModel: provider.model,
    });
    return { kind: "ready_to_render", generation: ready };
  } catch (error) {
    return persistFailure(userId, generation, "generation", error);
  }
}

export async function renderResumeGeneration(userId: string, jobId: string, generationId: string): Promise<RenderResumeGenerationResult> {
  const store = getAppStore();
  const [job, profile, generation] = await Promise.all([
    store.getJob(userId, jobId),
    store.getCandidateProfile(userId),
    store.getResumeGeneration(userId, generationId),
  ]);
  if (!job || !generation || generation.jobId !== jobId) throw new ResourceNotFoundError("Resume generation");
  if (!profile) throw new MissingCandidateProfileError();
  if (generation.status === "completed") {
    const cv = await existingCv(userId, jobId, generation.id);
    if (cv) return { kind: "success", generation, cv };
  }
  if (!generation.generatedContent) throw new ResumeGenerationError("RESUME_CONTENT_MISSING", "Generate structured resume content before rendering the PDF.", "render");
  const generatedContent = generation.generatedContent;
  if (hasLiveLease(generation)) return { kind: "in_progress", generation };
  const claimed = await store.claimResumeGeneration(userId, generation.id, {
    expectedUpdatedAt: generation.updatedAt,
    status: "rendering",
    currentStage: "render",
    leaseExpiresAt: leaseExpiresAt(),
  });
  if (!claimed) return { kind: "in_progress", generation: (await store.getResumeGeneration(userId, generation.id)) ?? generation };

  try {
    const templates = await store.listResumeTemplates(userId);
    const template = templates.find((candidate) => candidate.version === claimed.templateVersion);
    if (!template) throw new ResumeGenerationError("TEMPLATE_VERSION_MISSING", "The template version selected for this generation is no longer available. Start a new generation with the active template.", "render");
    const templateFile = await store.downloadResumeTemplate(userId, template.id);
    const parsedTemplate = validateResumeTemplateBytes(templateFile.bytes);
    if (!parsedTemplate.ok) throw new ResumeGenerationError("TEMPLATE_INVALID", parsedTemplate.message, "render");
    const renderedHtml = renderResumeTemplate(parsedTemplate.html, { personal: profile.personal, content: generatedContent });
    const bytes = await renderHtmlToPdf(renderedHtml);
    if (bytes.byteLength > MAX_PDF_BYTES) throw new ResumeGenerationError("RESUME_PDF_SIZE_LIMIT", "The generated PDF exceeds the 2 MB private-storage limit.", "render");
    const cv = await store.createGeneratedCv(userId, jobId, {
      bytes,
      content: generatedContent,
      aiProvider: claimed.aiProvider ?? "unknown",
      aiModel: claimed.aiModel ?? "unknown",
      generationId: claimed.id,
      templateVersion: claimed.templateVersion,
    });
    const completed = await store.updateResumeGeneration(userId, claimed.id, { status: "completed", currentStage: "render", attemptCount: 0, nextRetryAt: null, leaseExpiresAt: null, errorCode: null });
    return { kind: "success", generation: completed, cv };
  } catch (error) {
    return persistFailure(userId, claimed, "render", error);
  }
}
