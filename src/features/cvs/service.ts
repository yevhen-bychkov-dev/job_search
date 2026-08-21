import "server-only";

import { candidateProfileForAi } from "@/features/knowledge/candidate-profile";
import { getAppStore } from "@/lib/data/server-store";
import { ResourceNotFoundError } from "@/lib/data/contracts";
import { reportUnexpectedError } from "@/lib/server-errors";

import { createCvAiProvider } from "./ai/factory";
import { CvAiProviderError } from "./ai/provider";
import { matchVacancyAnalysis, confirmationQuestions, materializeResumeContent, parseVacancyAnalysis } from "./domain";
import { renderHtmlToPdf } from "./html-to-pdf";
import { renderResumeTemplate, validateResumeTemplateBytes } from "./template";
import type { GeneratedCv, ResumeConfirmation, ResumeConfirmationLevel, ResumeGeneration, ResumeConfirmationQuestion } from "./types";

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

export class ResumeGenerationError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ResumeGenerationError";
    this.code = code;
  }
}

export type BeginResumeGenerationResult =
  | { kind: "confirmation"; generation: ResumeGeneration; questions: ResumeConfirmationQuestion[] }
  | { kind: "success"; generation: ResumeGeneration; cv: GeneratedCv }
  | { kind: "in_progress"; generation: ResumeGeneration };

function jobPayload(job: { title: string; company: string; description: string; technologies: string[] }) {
  return { title: job.title, company: job.company, description: job.description, technologies: [...job.technologies] };
}

async function requiredInputs(userId: string, jobId: string) {
  const store = getAppStore();
  const [job, profile, template, confirmations] = await Promise.all([
    store.getJob(userId, jobId),
    store.getCandidateProfile(userId),
    store.getActiveResumeTemplate(userId),
    store.listResumeConfirmations(userId),
  ]);
  if (!job) throw new ResourceNotFoundError("Job");
  if (!profile) throw new MissingCandidateProfileError();
  if (!template) throw new MissingResumeTemplateError();
  return { store, job, profile, template, confirmations };
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
  if (error instanceof ResumeGenerationError) throw error;
  if (error instanceof CvAiProviderError) {
    const message = error.code === "GEMINI_CONFIG_MISSING"
      ? "Gemini is not configured for this deployment. Add GEMINI_API_KEY and GEMINI_MODEL."
      : error.code === "GEMINI_HTTP_401" || error.code === "GEMINI_HTTP_403"
        ? "Gemini rejected the configured API credentials. Check GEMINI_API_KEY."
        : error.code === "GEMINI_HTTP_429"
          ? "Gemini rate limit reached. Please wait and retry."
          : error.code.startsWith("GEMINI_HTTP_5") || error.code === "GEMINI_NETWORK_FAILURE"
            ? "Gemini is temporarily unavailable. Please retry."
            : `Gemini could not produce structured resume content (${error.code}).`;
    throw new ResumeGenerationError(error.code, message, { cause: error });
  }
  throw new ResumeGenerationError(code, "Resume generation failed. Please retry.", { cause: error });
}

async function finalizeResumeGeneration(
  userId: string,
  generation: ResumeGeneration,
  input: Awaited<ReturnType<typeof requiredInputs>>,
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
  const input = await requiredInputs(userId, jobId);
  const generation = await input.store.createResumeGeneration(userId, jobId, idempotencyKey);
  if (generation.status === "completed") {
    const existing = (await input.store.listGeneratedCvs(userId, jobId)).find((cv) => cv.generationId === generation.id);
    if (existing) return { kind: "success", generation, cv: existing };
  }
  if (generation.status === "awaiting_confirmation" && generation.analysis) return { kind: "confirmation", generation, questions: confirmationQuestions(generation.analysis) };
  if (generation.status === "generating" || generation.status === "rendering") return { kind: "in_progress", generation };
  let analyzed = generation;
  try {
    const provider = createCvAiProvider();
    const untrustedAnalysis = await provider.analyzeVacancy({ job: jobPayload(input.job), candidate: candidateProfileForAi(input.profile), confirmations: input.confirmations });
    const parsed = parseVacancyAnalysis(untrustedAnalysis);
    if (!parsed.ok) throw new ResumeGenerationError("VACANCY_ANALYSIS_REJECTED", `Vacancy analysis was rejected: ${parsed.message}`);
    const matched = matchVacancyAnalysis(parsed.data, input.profile, input.confirmations);
    analyzed = await input.store.updateResumeGeneration(userId, generation.id, { status: "awaiting_confirmation", analysis: matched, confirmations: input.confirmations, templateVersion: input.template.version, errorCode: null });
  } catch (error) {
    return failGeneration(userId, generation, error);
  }
  const questions = confirmationQuestions(analyzed.analysis ?? { mustHaveTechnical: [], niceToHaveTechnical: [], tooling: [], architecture: [], domainKnowledge: [], responsibilities: [], ownershipExpectations: [], senioritySignals: [], collaborationExpectations: [], leadershipExpectations: [], atsKeywords: [], employerTerminology: [] });
  if (questions.length > 0) return { kind: "confirmation", generation: analyzed, questions };
  return finalizeResumeGeneration(userId, analyzed, input).then(({ generation: completed, cv }) => ({ kind: "success" as const, generation: completed, cv }));
}

export async function confirmAndGenerateResume(userId: string, generationId: string, answers: Array<{ key: string; level: ResumeConfirmationLevel }>): Promise<GeneratedCv> {
  const store = getAppStore();
  const generation = await store.getResumeGeneration(userId, generationId);
  if (!generation || !generation.analysis) throw new ResourceNotFoundError("Resume generation");
  const questions = new Map(confirmationQuestions(generation.analysis).map((question) => [question.key, question]));
  const confirmations: ResumeConfirmation[] = [];
  for (const answer of answers) {
    const question = questions.get(answer.key);
    if (!question || !["commercial", "familiar", "none"].includes(answer.level)) throw new ResumeGenerationError("CONFIRMATION_INVALID", "The confirmation answers are invalid.");
    confirmations.push({ key: question.key, label: question.label, level: answer.level, provenance: "explicit_user_confirmation" });
  }
  if (confirmations.length !== questions.size) throw new ResumeGenerationError("CONFIRMATION_INCOMPLETE", "Confirm each important requirement before generating the resume.");
  for (const confirmation of confirmations) await store.saveResumeConfirmation(userId, confirmation);
  const input = await requiredInputs(userId, generation.jobId);
  const rematched = matchVacancyAnalysis(generation.analysis, input.profile, [...input.confirmations, ...confirmations]);
  const allConfirmations = [...input.confirmations, ...confirmations];
  const ready = await store.updateResumeGeneration(userId, generation.id, { status: "awaiting_confirmation", analysis: rematched, confirmations: allConfirmations, templateVersion: input.template.version, errorCode: null });
  const result = await finalizeResumeGeneration(userId, ready, { ...input, confirmations: allConfirmations });
  return result.cv;
}
