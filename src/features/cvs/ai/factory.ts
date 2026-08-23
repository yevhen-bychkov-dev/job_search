import "server-only";

import { isPlaywrightTestMode } from "@/lib/supabase/environment";

import type { AnalyzeVacancyInput, CvAiProvider, GenerateCvInput } from "./provider";
import { CvAiProviderError, deterministicAnalysis, deterministicResume } from "./provider";
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
  const validConfiguredFallback = configuredFallback && configuredFallback !== "PASTE_HERE" && /^[A-Za-z0-9._-]{1,100}$/.test(configuredFallback)
    ? configuredFallback
    : null;
  if (configuredFallback && configuredFallback !== "PASTE_HERE" && !validConfiguredFallback) {
    console.warn(JSON.stringify({ event: "resume.gemini.config", field: "GEMINI_FALLBACK_MODEL", valid: false, fallbackDisabled: true }));
  }
  const fallbackModel = validConfiguredFallback
    ? validModel("GEMINI_FALLBACK_MODEL", validConfiguredFallback)
    : model === "gemini-3.7-flash"
      ? "gemini-3.6-flash"
      : null;
  return new GeminiCvProvider(model, requiredEnvironment("GEMINI_API_KEY"), fallbackModel);
}
