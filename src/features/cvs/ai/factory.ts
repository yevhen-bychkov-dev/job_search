import "server-only";

import { isPlaywrightTestMode } from "@/lib/supabase/environment";

import type { AnalyzeVacancyInput, CvAiProvider, GenerateCvInput } from "./provider";
import { CvAiProviderError, deterministicAnalysis, deterministicCritique, deterministicResume, deterministicStrategy } from "./provider";
import type { ResumeCorrectionInput, ResumeCritiqueInput, ResumeStrategyInput } from "./provider";
import { GeminiCvProvider } from "./providers/gemini";

class SyntheticCvProvider implements CvAiProvider {
  readonly providerId = "synthetic";
  readonly model = "deterministic-e2e";

  async analyzeVacancy(input: AnalyzeVacancyInput): Promise<unknown> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return deterministicAnalysis(input);
  }

  async generateCv(input: GenerateCvInput): Promise<unknown> {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return deterministicResume(input);
  }

  async createStrategy(input: ResumeStrategyInput): Promise<unknown> {
    await new Promise((resolve) => setTimeout(resolve, 75));
    return deterministicStrategy(input);
  }

  async critiqueCv(input: ResumeCritiqueInput): Promise<unknown> {
    await new Promise((resolve) => setTimeout(resolve, 75));
    return deterministicCritique(input);
  }

  async correctCv(input: ResumeCorrectionInput): Promise<unknown> {
    await new Promise((resolve) => setTimeout(resolve, 75));
    return deterministicResume({ ...input, strategy: input.strategy } as GenerateCvInput);
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
  const configuredFallback = process.env.GEMINI_FALLBACK_MODEL?.trim();
  const fallbackModel = configuredFallback && configuredFallback !== "PASTE_HERE"
    ? validModel("GEMINI_FALLBACK_MODEL", configuredFallback)
    : model === "gemini-3.7-flash"
      ? "gemini-3.6-flash"
      : null;
  return new GeminiCvProvider(model, requiredEnvironment("GEMINI_API_KEY"), fallbackModel);
}
