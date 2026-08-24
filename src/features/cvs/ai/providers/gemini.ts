import "server-only";

import type { AnalyzeVacancyInput, CvAiProvider, GenerateCvInput, ResumeAiContext } from "../provider.ts";
import { CvAiProviderError, extractGeminiStructuredResponse } from "../provider.ts";
import { buildGeminiAnalysisRequest, buildGeminiResumeRequest } from "../gemini-request.ts";
import { fetchGeminiWithFallback, isGeminiTimeout } from "../gemini-retry.ts";

const ANALYSIS_TIMEOUT_MS = 45_000;
const GENERATION_TIMEOUT_MS = 100_000;

function tokenUsage(payload: unknown): Record<string, number | null> {
  if (typeof payload !== "object" || payload === null || !("usageMetadata" in payload)) return {};
  const usage = payload.usageMetadata;
  if (typeof usage !== "object" || usage === null) return {};
  const count = (field: string): number | null => field in usage && typeof (usage as Record<string, unknown>)[field] === "number" ? (usage as Record<string, number>)[field] : null;
  return {
    promptTokens: count("promptTokenCount"),
    candidateTokens: count("candidatesTokenCount"),
    thoughtTokens: count("thoughtsTokenCount"),
    totalTokens: count("totalTokenCount"),
  };
}

export class GeminiCvProvider implements CvAiProvider {
  readonly providerId = "gemini";
  private readonly primaryModel: string;
  private readonly analysisModel: string;
  private readonly fallbackModel: string | null;
  private selectedModel: string;
  private readonly apiKey: string;
  private readonly fetchImplementation: typeof fetch;

  constructor(
    model: string,
    apiKey: string,
    fallbackModel: string | null = null,
    analysisModel: string = model,
    fetchImplementation: typeof fetch = fetch,
  ) {
    this.primaryModel = model;
    this.analysisModel = analysisModel;
    this.fallbackModel = fallbackModel;
    this.selectedModel = model;
    this.apiKey = apiKey;
    this.fetchImplementation = fetchImplementation;
  }

  get model(): string {
    return this.selectedModel;
  }

  private async request(primaryModel: string, bodyForModel: (model: string) => Record<string, unknown>, timeoutMs: number, context?: ResumeAiContext): Promise<unknown> {
    const startedAt = Date.now();
    const deadline = startedAt + timeoutMs;
    const primaryBody = JSON.stringify(bodyForModel(primaryModel));
    const metadata = { generationId: context?.generationId ?? null, jobId: context?.jobId ?? null, stage: context?.stage ?? "unknown", model: primaryModel, requestBytes: new TextEncoder().encode(primaryBody).byteLength, timeoutMs };
    let response: Response;
    let attempts = 1;
    try {
      const result = await fetchGeminiWithFallback(
        this.fetchImplementation,
        primaryModel,
        this.fallbackModel,
        (model) => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        (model) => ({
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": this.apiKey,
          },
          body: JSON.stringify(bodyForModel(model)),
          signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
        }),
        undefined,
        { generationId: context?.generationId ?? null, jobId: context?.jobId ?? null, stage: context?.stage ?? "unknown" },
      );
      response = result.response;
      attempts = result.attempts;
      this.selectedModel = result.model;
      if (!response.ok) console.info(JSON.stringify({ event: "resume.gemini", ...metadata, model: result.model, attempts: result.attempts, durationMs: Date.now() - startedAt, responseStatus: Math.floor(response.status / 100) * 100, success: false }));
    } catch (error) {
      console.warn(JSON.stringify({ event: "resume.gemini", ...metadata, durationMs: Date.now() - startedAt, success: false, errorCategory: error instanceof CvAiProviderError ? error.code : "network" }));
      if (isGeminiTimeout(error)) throw new CvAiProviderError("GEMINI_TIMEOUT", `Gemini did not respond within ${Math.round(timeoutMs / 1_000)} seconds.`, { cause: error });
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
    const payload = await response.json() as unknown;
    console.info(JSON.stringify({ event: "resume.gemini", ...metadata, model: this.selectedModel, attempts, durationMs: Date.now() - startedAt, responseStatus: 200, success: true, ...tokenUsage(payload) }));
    return extractGeminiStructuredResponse(payload);
  }

  async analyzeVacancy(input: AnalyzeVacancyInput, context?: ResumeAiContext): Promise<unknown> {
    return this.request(this.analysisModel, (model) => buildGeminiAnalysisRequest(input, model), ANALYSIS_TIMEOUT_MS, context);
  }

  async generateCv(input: GenerateCvInput, context?: ResumeAiContext): Promise<unknown> {
    return this.request(this.primaryModel, (model) => buildGeminiResumeRequest(input, model), GENERATION_TIMEOUT_MS, context);
  }
}
