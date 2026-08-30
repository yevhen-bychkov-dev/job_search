import "server-only";

import { isPlaywrightTestMode } from "@/lib/supabase/environment";

import type { AnalyzeVacancyInput, AssessCvInput, CvAiProvider, GenerateCoverLetterInput, GenerateCvInput } from "./provider";
import { CvAiProviderError, deterministicAnalysis, deterministicCoverLetter, deterministicCvAssessment, deterministicResume } from "./provider";
import { isHighQualityCvModel } from "./gemini-request";
import { GeminiCvProvider } from "./providers/gemini";

class SyntheticCvProvider implements CvAiProvider {
  readonly providerId = "synthetic";
  readonly model = "deterministic-e2e";

  async analyzeVacancy(input: AnalyzeVacancyInput): Promise<unknown> {
    return deterministicAnalysis(input);
  }

  async generateCv(input: GenerateCvInput): Promise<unknown> {
    return deterministicResume(input);
  }

  async generateCoverLetter(input: GenerateCoverLetterInput): Promise<unknown> {
    return deterministicCoverLetter(input);
  }

  async assessCv(input: AssessCvInput): Promise<unknown> {
    return deterministicCvAssessment(input);
  }
}

function requiredEnvironment(name: "GEMINI_API_KEY" | "GEMINI_MODEL"): string {
  const value = process.env[name]?.trim();
  if (!value || value === "PASTE_HERE") throw new CvAiProviderError("GEMINI_CONFIG_MISSING", `${name} is not configured.`);
  return value;
}

function validModel(name: string, value: string): string {
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(value)) throw new CvAiProviderError("GEMINI_MODEL_INVALID", `${name} has an invalid format.`);
  return value;
}

export function createCvAiProvider(): CvAiProvider {
  if (isPlaywrightTestMode()) return new SyntheticCvProvider();
  const model = validModel("GEMINI_MODEL", requiredEnvironment("GEMINI_MODEL"));
  if (!isHighQualityCvModel(model)) throw new CvAiProviderError("GEMINI_CV_MODEL_TOO_WEAK", "GEMINI_MODEL must use a supported full Gemini Flash model for final CV writing; keep Flash-Lite only in GEMINI_ANALYSIS_MODEL.");
  const configuredFallback = process.env.GEMINI_FALLBACK_MODEL?.trim();
  const validConfiguredFallback = configuredFallback && configuredFallback !== "PASTE_HERE" && /^[A-Za-z0-9._-]{1,100}$/.test(configuredFallback)
    ? configuredFallback
    : null;
  if (configuredFallback && configuredFallback !== "PASTE_HERE" && !validConfiguredFallback) {
    console.warn(JSON.stringify({ event: "resume.gemini.config", field: "GEMINI_FALLBACK_MODEL", valid: false, fallbackDisabled: true }));
  }
  const fallbackModel = validConfiguredFallback
    ? validModel("GEMINI_FALLBACK_MODEL", validConfiguredFallback)
    : model === "gemini-3.6-flash"
      ? "gemini-3.6-flash"
      : null;
  const configuredAnalysis = process.env.GEMINI_ANALYSIS_MODEL?.trim();
  const analysisModel = configuredAnalysis && configuredAnalysis !== "PASTE_HERE"
    ? validModel("GEMINI_ANALYSIS_MODEL", configuredAnalysis)
    : model === "gemini-3.6-flash"
      ? "gemini-3.5-flash-lite"
      : model;
  return new GeminiCvProvider(model, requiredEnvironment("GEMINI_API_KEY"), fallbackModel, analysisModel);
}
