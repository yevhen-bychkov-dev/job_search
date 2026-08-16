import "server-only";

import type { CvAiProvider, GenerateCvInput } from "../provider.ts";
import { CvAiProviderError, extractGeminiStructuredResponse } from "../provider.ts";
import { buildGeminiCvRequest } from "../gemini-request.ts";

export class GeminiCvProvider implements CvAiProvider {
  readonly providerId = "gemini";
  readonly model: string;
  private readonly apiKey: string;
  private readonly fetchImplementation: typeof fetch;

  constructor(
    model: string,
    apiKey: string,
    fetchImplementation: typeof fetch = fetch,
  ) {
    this.model = model;
    this.apiKey = apiKey;
    this.fetchImplementation = fetchImplementation;
  }

  async generateCv(input: GenerateCvInput): Promise<unknown> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    let response: Response;
    try {
      response = await this.fetchImplementation(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify(buildGeminiCvRequest(input)),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      throw new CvAiProviderError("GEMINI_NETWORK_FAILURE", "Gemini request did not complete.", { cause: error });
    }
    if (!response.ok) throw new CvAiProviderError(`GEMINI_HTTP_${response.status}`, `Gemini request failed with HTTP ${response.status}.`);
    return extractGeminiStructuredResponse(await response.json() as unknown);
  }
}
