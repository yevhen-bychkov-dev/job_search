import "server-only";

import { candidateProfileForAi } from "@/features/knowledge/candidate-profile";
import { getAppStore } from "@/lib/data/server-store";
import { ResourceNotFoundError } from "@/lib/data/contracts";
import { reportUnexpectedError } from "@/lib/server-errors";

import { createCvAiProvider } from "./ai/factory";
import { CvAiProviderError } from "./ai/provider";
import { matchVacancyAnalysis, materializeResumeContent, parseResumeCritique, parseResumeStrategy, parseVacancyAnalysis, savedJobRequirementsFromAnalysis, savedJobRequirementsToAnalysis, validateResumeRequirementCoverage, validateSavedJobRequirements } from "./domain";
import { renderHtmlToPdf } from "./html-to-pdf";
import { renderResumeTemplate, validateResumeTemplateBytes } from "./template";
import type { GeneratedCv, JobResumeRequirements, ResumeAiStage, ResumeConfirmationLevel, ResumeGeneration, ResumeCritique, ResumeStrategy } from "./types";

export class MissingCandidateProfileError extends Error { constructor() { super("Add a valid Candidate Profile JSON in the Knowledge Base before generating a resume."); this.name = "MissingCandidateProfileError"; } }
export class MissingResumeTemplateError extends Error { constructor() { super("Configure a valid HTML Resume Template in Account before generating a resume."); this.name = "MissingResumeTemplateError"; } }
export class MissingJobRequirementsError extends Error { constructor() { super("Analyze and save the vacancy requirements before generating a resume."); this.name = "MissingJobRequirementsError"; } }
export class ResumeGenerationError extends Error { readonly code: string; constructor(code: string, message: string, options?: ErrorOptions) { super(message, options); this.name = "ResumeGenerationError"; this.code = code; } }

export type BeginResumeGenerationResult = { kind: "success"; generation: ResumeGeneration; cv: GeneratedCv } | { kind: "in_progress"; generation: ResumeGeneration };

function geminiRateLimitMessage(error: CvAiProviderError): string {
  const cause = error.cause;
  const details = typeof cause === "object" && cause !== null ? Object.values(cause).filter((value): value is string => typeof value === "string").join(" ").toLocaleLowerCase("en") : "";
  return details.includes("quota") || details.includes("resource_exhausted") ? "Gemini project quota is exhausted (GEMINI_HTTP_429). Check the Gemini project quota/billing or configure a different Gemini project/model." : "Gemini is rate-limited after bounded retries (GEMINI_HTTP_429). Completed resume stages were preserved; retry later to resume this stage.";
}

function throwGenerationFailure(error: unknown): never {
  if (error instanceof ResumeGenerationError) throw error;
  if (error instanceof CvAiProviderError) {
    reportUnexpectedError("cvs.gemini", error);
    const message = error.code === "GEMINI_CONFIG_MISSING" ? "Gemini is not configured for this deployment. Add GEMINI_API_KEY and GEMINI_MODEL." : error.code === "GEMINI_HTTP_401" || error.code === "GEMINI_HTTP_403" ? "Gemini rejected the configured API credentials. Check GEMINI_API_KEY." : error.code === "GEMINI_HTTP_429" ? geminiRateLimitMessage(error) : error.code.startsWith("GEMINI_HTTP_5") ? `Gemini is temporarily unavailable after automatic retries (${error.code}). Completed stages were preserved; retry to resume.` : error.code === "GEMINI_TIMEOUT" ? "Gemini did not respond after automatic retries (GEMINI_TIMEOUT). Completed stages were preserved; retry to resume." : error.code === "GEMINI_NETWORK_FAILURE" ? "The Gemini network request failed after automatic retries (GEMINI_NETWORK_FAILURE). Completed stages were preserved; retry to resume." : `Gemini could not produce structured resume content (${error.code}).`;
    throw new ResumeGenerationError(error.code, message, { cause: error });
  }
  throw new ResumeGenerationError("RESUME_GENERATION_FAILED", "Resume generation failed. Please retry.", { cause: error });
}

function jobPayload(job: { title: string; company: string; description: string; technologies: string[] }) { return { title: job.title, company: job.company, description: job.description, technologies: [...job.technologies] }; }

async function requiredAnalysisInputs(userId: string, jobId: string) {
  const store = getAppStore();
  const [job, profile] = await Promise.all([store.getJob(userId, jobId), store.getCandidateProfile(userId)]);
  if (!job) throw new ResourceNotFoundError("Job");
  if (!profile) throw new MissingCandidateProfileError();
  return { store, job, profile };
}
async function requiredGenerationInputs(userId: string, jobId: string) { const base = await requiredAnalysisInputs(userId, jobId); const template = await base.store.getActiveResumeTemplate(userId); if (!template) throw new MissingResumeTemplateError(); return { ...base, template }; }
function isRetryableGeminiCode(code: string): boolean { return code === "GEMINI_HTTP_429" || code === "GEMINI_TIMEOUT" || code === "GEMINI_NETWORK_FAILURE" || /^GEMINI_HTTP_5\d\d$/.test(code); }
function statusForFailure(code: string): "rate_limited" | "failed" { return code === "GEMINI_HTTP_429" ? "rate_limited" : "failed"; }
function retryEligibility(error: unknown): string | null {
  if (!(error instanceof CvAiProviderError) || error.code !== "GEMINI_HTTP_429" || typeof error.cause !== "object" || error.cause === null || !("retryAfter" in error.cause) || typeof error.cause.retryAfter !== "string") return null;
  const value = error.cause.retryAfter;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return new Date(Date.now() + seconds * 1_000).toISOString();
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

async function persistStageFailure(userId: string, generation: ResumeGeneration, stage: ResumeAiStage, error: unknown): Promise<never> {
  const code = error instanceof ResumeGenerationError || error instanceof CvAiProviderError ? error.code : "RESUME_GENERATION_FAILED";
  try { await getAppStore().updateResumeGeneration(userId, generation.id, { status: isRetryableGeminiCode(code) ? statusForFailure(code) : "failed", currentStage: stage, attemptCount: generation.attemptCount + 1, nextRetryAt: retryEligibility(error), errorCode: code }); } catch (updateError) { reportUnexpectedError("cvs.generation.failure-state", updateError); }
  return throwGenerationFailure(error);
}

function forceCoverageCritique(critique: ResumeCritique, missing: string[]): ResumeCritique {
  if (missing.length === 0) return critique;
  return { ...critique, score: Math.min(critique.score, 7), passes: false, missingSupportedRequirements: [...new Set([...critique.missingSupportedRequirements, ...missing])], problems: [...critique.problems, ...missing.map((label) => ({ type: "missing_requirement" as const, severity: "high" as const, description: `Supported requirement ${label} is not meaningfully represented.`, suggestedFix: `Surface verified evidence for ${label}.` }))] };
}

const QUALITY_SCORE_THRESHOLD = 8;

async function continueResumeGeneration(userId: string, generation: ResumeGeneration, input: Awaited<ReturnType<typeof requiredGenerationInputs>>): Promise<{ generation: ResumeGeneration; cv: GeneratedCv }> {
  const { store, job, profile, template } = input;
  let current = generation;
  const candidate = candidateProfileForAi(profile);
  const jobInput = jobPayload(job);
  const analysis = current.analysis;
  if (!analysis) throw new ResumeGenerationError("ANALYSIS_MISSING", "Resume requirement analysis is missing.");
  const provider = createCvAiProvider();
  const context = (stage: Exclude<ResumeAiStage, "render">) => ({ generationId: current.id, jobId: job.id, stage });
  try {
    const confirmations = current.confirmations;
    if (!current.strategy) {
      current = await store.updateResumeGeneration(userId, current.id, { status: "strategizing", currentStage: "strategy", attemptCount: 0, nextRetryAt: null, errorCode: null, templateVersion: template.version });
      const raw = await provider.createStrategy({ job: jobInput, candidate, confirmations, analysis, context: context("strategy") });
      const parsed = parseResumeStrategy(raw);
      if (!parsed.ok) throw new ResumeGenerationError("RESUME_STRATEGY_REJECTED", `The resume strategy was rejected: ${parsed.message}`);
      current = await store.updateResumeGeneration(userId, current.id, { status: "generating", strategy: parsed.data, currentStage: "generation", attemptCount: 0, errorCode: null });
    }
    if (!current.generatedContent) {
      current = await store.updateResumeGeneration(userId, current.id, { status: "generating", currentStage: "generation", nextRetryAt: null });
      const raw = await provider.generateCv({ job: jobInput, candidate, confirmations, analysis, strategy: current.strategy as ResumeStrategy }, context("generation"));
      const materialized = materializeResumeContent(profile, raw, confirmations);
      if (!materialized.ok) throw new ResumeGenerationError("RESUME_CONTENT_REJECTED", `The generated resume was rejected: ${materialized.message}`);
      current = await store.updateResumeGeneration(userId, current.id, { status: "critiquing", generatedContent: materialized.data, currentStage: "critique", attemptCount: 0, errorCode: null });
    }
    if (!current.critique) {
      current = await store.updateResumeGeneration(userId, current.id, { status: "critiquing", currentStage: "critique", nextRetryAt: null });
      const raw = await provider.critiqueCv({ job: jobInput, candidate, confirmations, analysis, strategy: current.strategy as ResumeStrategy, generatedContent: current.generatedContent!, context: context("critique") });
      const parsed = parseResumeCritique(raw);
      if (!parsed.ok) throw new ResumeGenerationError("RESUME_CRITIQUE_REJECTED", `The resume critique was rejected: ${parsed.message}`);
      const coverage = validateResumeRequirementCoverage(analysis, confirmations, current.generatedContent!);
      current = await store.updateResumeGeneration(userId, current.id, { status: "correcting", critique: forceCoverageCritique(parsed.data, coverage.ok ? [] : coverage.missing), currentStage: "correction", attemptCount: 0, errorCode: null });
    }
    const critique = current.critique!;
    const mustCorrect = !critique.passes || critique.score < QUALITY_SCORE_THRESHOLD || critique.problems.some((problem) => problem.severity === "high");
    let finalContent = current.correction ?? current.generatedContent;
    if (mustCorrect && !current.correction) {
      current = await store.updateResumeGeneration(userId, current.id, { status: "correcting", currentStage: "correction", nextRetryAt: null });
      const raw = await provider.correctCv({ job: jobInput, candidate, confirmations, analysis, strategy: current.strategy!, generatedContent: current.generatedContent!, critique, context: context("correction") });
      const materialized = materializeResumeContent(profile, raw, confirmations);
      if (!materialized.ok) throw new ResumeGenerationError("RESUME_CORRECTION_REJECTED", `The corrected resume was rejected: ${materialized.message}`);
      current = await store.updateResumeGeneration(userId, current.id, { status: "rendering", correction: materialized.data, currentStage: "render", attemptCount: 0, errorCode: null });
      finalContent = materialized.data;
    } else {
      current = await store.updateResumeGeneration(userId, current.id, { status: "rendering", currentStage: "render", nextRetryAt: null, errorCode: null });
    }
    if (!finalContent) throw new ResumeGenerationError("RESUME_CONTENT_MISSING", "The finalized resume content is missing.");
    const coverage = validateResumeRequirementCoverage(analysis, confirmations, finalContent);
    if (!coverage.ok) throw new ResumeGenerationError("RESUME_COVERAGE_INCOMPLETE", `The finalized resume omitted supported requirements: ${coverage.missing.join(", ")}.`);
    const templateFile = await store.downloadResumeTemplate(userId, template.id);
    const parsedTemplate = validateResumeTemplateBytes(templateFile.bytes);
    if (!parsedTemplate.ok) throw new ResumeGenerationError("TEMPLATE_INVALID", parsedTemplate.message);
    const renderedHtml = renderResumeTemplate(parsedTemplate.html, { personal: profile.personal, content: finalContent });
    let bytes: Uint8Array;
    try { bytes = await renderHtmlToPdf(renderedHtml); } catch (error) { throw new ResumeGenerationError("PDF_RENDER_UNAVAILABLE", "The PDF renderer is unavailable in this deployment. Configure a Chromium executable with CHROMIUM_PATH and retry.", { cause: error }); }
    if (bytes.byteLength > 2 * 1024 * 1024) throw new ResumeGenerationError("RESUME_PDF_SIZE_LIMIT", "The generated PDF exceeds the private storage limit.");
    const cv = await store.createGeneratedCv(userId, job.id, { bytes, content: finalContent, aiProvider: provider.providerId, aiModel: provider.model, generationId: current.id, templateVersion: template.version });
    const completed = await store.updateResumeGeneration(userId, current.id, { status: "completed", currentStage: "render", nextRetryAt: null, errorCode: null });
    return { generation: completed, cv };
  } catch (error) { return persistStageFailure(userId, current, current.currentStage ?? "render", error); }
}

export async function beginResumeGeneration(userId: string, jobId: string, idempotencyKey: string): Promise<BeginResumeGenerationResult> {
  const input = await requiredGenerationInputs(userId, jobId);
  const savedRequirements = await input.store.getJobResumeRequirements(userId, jobId);
  if (!savedRequirements) throw new MissingJobRequirementsError();
  const latest = await input.store.getLatestResumeGeneration(userId, jobId);
  const activeStatuses = ["awaiting_confirmation", "strategizing", "generating", "critiquing", "correcting", "rendering", "retrying"];
  if (latest && activeStatuses.includes(latest.status)) return { kind: "in_progress", generation: latest };
  const resumable = latest && (latest.status === "rate_limited" || latest.status === "failed");
  const generation = resumable ? latest : await input.store.createResumeGeneration(userId, jobId, idempotencyKey);
  if (generation.status === "completed") { const existing = (await input.store.listGeneratedCvs(userId, jobId)).find((cv) => cv.generationId === generation.id); if (existing) return { kind: "success", generation, cv: existing }; }
  if (["strategizing", "generating", "critiquing", "correcting", "rendering", "retrying"].includes(generation.status)) return { kind: "in_progress", generation };
  const analysis = savedJobRequirementsToAnalysis(savedRequirements);
  const confirmations = savedRequirements.requirements.filter((requirement) => requirement.level !== "unconfirmed").map((requirement) => ({ key: requirement.key, label: requirement.label, level: requirement.level as ResumeConfirmationLevel, provenance: requirement.source === "ai" ? "existing_kb" as const : "explicit_user_confirmation" as const }));
  const ready = await input.store.updateResumeGeneration(userId, generation.id, { status: "awaiting_confirmation", analysis, confirmations, currentStage: generation.currentStage ?? "analysis", templateVersion: input.template.version, nextRetryAt: null, errorCode: null });
  return continueResumeGeneration(userId, ready, input).then(({ generation: completed, cv }) => ({ kind: "success" as const, generation: completed, cv }));
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
  } catch (error) { return throwGenerationFailure(error); }
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
