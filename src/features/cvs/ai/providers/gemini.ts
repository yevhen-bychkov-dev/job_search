import "server-only";

import type { AnalyzeVacancyInput, CvAiProvider, GenerateCvInput } from "../provider.ts";
import { CvAiProviderError, extractGeminiStructuredResponse } from "../provider.ts";
import { buildGeminiAnalysisRequest, buildGeminiResumeRequest } from "../gemini-request.ts";
import { fetchGeminiWithFallback, isGeminiTimeout } from "../gemini-retry.ts";

export class GeminiCvProvider implements CvAiProvider {
  readonly providerId = "gemini";
  private readonly primaryModel: string;
  private readonly fallbackModel: string | null;
  private selectedModel: string;
  private readonly apiKey: string;
  private readonly fetchImplementation: typeof fetch;

  constructor(
    model: string,
    apiKey: string,
    fallbackModel: string | null = null,
    fetchImplementation: typeof fetch = fetch,
  ) {
    this.primaryModel = model;
    this.fallbackModel = fallbackModel;
    this.selectedModel = model;
    this.apiKey = apiKey;
    this.fetchImplementation = fetchImplementation;
  }

  get model(): string {
    return this.selectedModel;
  }

  private async request(body: Record<string, unknown>): Promise<unknown> {
    let response: Response;
    try {
      const result = await fetchGeminiWithFallback(
        this.fetchImplementation,
        this.primaryModel,
        this.fallbackModel,
        (model) => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        () => ({
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": this.apiKey,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(60_000),
        }),
      );
      response = result.response;
      this.selectedModel = result.model;
    } catch (error) {
      if (isGeminiTimeout(error)) throw new CvAiProviderError("GEMINI_TIMEOUT", "Gemini did not respond within 60 seconds.", { cause: error });
      throw new CvAiProviderError("GEMINI_NETWORK_FAILURE", "Gemini request did not complete.", { cause: error });
    }
    if (!response.ok) {
      let providerStatus: string | undefined;
      let providerMessage: string | undefined;
      try {
        const payload: unknown = await response.clone().json();
        if (typeof payload === "object" && payload !== null && "error" in payload) {
          const error = payload.error;
          if (typeof error === "object" && error !== null) {
            if ("status" in error && typeof error.status === "string") providerStatus = error.status;
            if ("message" in error && typeof error.message === "string") providerMessage = error.message;
          }
        }
      } catch {
        // The HTTP status remains the reliable error signal when the provider
        // returns a non-JSON error body.
      }
      throw new CvAiProviderError(`GEMINI_HTTP_${response.status}`, `Gemini request failed with HTTP ${response.status}.`, {
        cause: { providerStatus, providerMessage },
      });
    }
    return extractGeminiStructuredResponse(await response.json() as unknown);
  }

  async analyzeVacancy(input: AnalyzeVacancyInput): Promise<unknown> {
    return this.request(buildGeminiAnalysisRequest(input));
  }

  async generateCv(input: GenerateCvInput): Promise<unknown> {
    return this.request(buildGeminiResumeRequest(input));
  }
}
