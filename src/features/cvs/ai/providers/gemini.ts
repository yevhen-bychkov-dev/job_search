import "server-only";

import type { AnalyzeVacancyInput, CvAiProvider, GenerateCvInput, ResumeAiContext, ResumeCorrectionInput, ResumeCritiqueInput, ResumeStrategyInput } from "../provider.ts";
import { CvAiProviderError, extractGeminiStructuredResponse } from "../provider.ts";
import { buildGeminiAnalysisRequest, buildGeminiCorrectionRequest, buildGeminiCritiqueRequest, buildGeminiResumeRequest, buildGeminiStrategyRequest } from "../gemini-request.ts";
import { fetchGeminiWithFallback, isGeminiTimeout, withGeminiConcurrency } from "../gemini-retry.ts";

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

  private async request(body: Record<string, unknown>, context?: ResumeAiContext): Promise<unknown> {
    const startedAt = Date.now();
    const metadata = { generationId: context?.generationId ?? null, jobId: context?.jobId ?? null, stage: context?.stage ?? "unknown", model: this.selectedModel };
    let response: Response;
    try {
      const result = await withGeminiConcurrency(() => fetchGeminiWithFallback(
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
        undefined,
        undefined,
        { generationId: context?.generationId ?? null, jobId: context?.jobId ?? null, stage: context?.stage ?? "unknown" },
      ));
      response = result.response;
      this.selectedModel = result.model;
      console.info(JSON.stringify({ event: "resume.gemini", ...metadata, model: result.model, durationMs: Date.now() - startedAt, responseStatus: Math.floor(response.status / 100) * 100, success: response.ok }));
    } catch (error) {
      console.warn(JSON.stringify({ event: "resume.gemini", ...metadata, durationMs: Date.now() - startedAt, success: false, errorCategory: error instanceof CvAiProviderError ? error.code : "network" }));
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
        cause: { providerStatus, providerMessage, retryAfter: response.headers.get("retry-after") ?? undefined },
      });
    }
    return extractGeminiStructuredResponse(await response.json() as unknown);
  }

  async analyzeVacancy(input: AnalyzeVacancyInput, context?: ResumeAiContext): Promise<unknown> {
    return this.request(buildGeminiAnalysisRequest(input), context);
  }

  async createStrategy(input: ResumeStrategyInput): Promise<unknown> {
    return this.request(buildGeminiStrategyRequest(input), input.context);
  }

  async generateCv(input: GenerateCvInput & { strategy?: unknown }, context?: ResumeAiContext): Promise<unknown> {
    return this.request(buildGeminiResumeRequest(input), context);
  }

  async critiqueCv(input: ResumeCritiqueInput): Promise<unknown> {
    return this.request(buildGeminiCritiqueRequest(input), input.context);
  }

  async correctCv(input: ResumeCorrectionInput): Promise<unknown> {
    return this.request(buildGeminiCorrectionRequest(input), input.context);
  }
}
