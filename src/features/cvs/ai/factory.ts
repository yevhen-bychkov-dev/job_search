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

export function createCvAiProvider(): CvAiProvider {
  if (isPlaywrightTestMode()) return new SyntheticCvProvider();
  const model = requiredEnvironment("GEMINI_MODEL");
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(model)) throw new CvAiProviderError("GEMINI_MODEL_INVALID", "GEMINI_MODEL has an invalid format.");
  return new GeminiCvProvider(model, requiredEnvironment("GEMINI_API_KEY"));
}
