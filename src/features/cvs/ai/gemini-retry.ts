const RETRY_DELAY_MS = 300;

type Wait = (milliseconds: number) => Promise<void>;
export type GeminiRetryMetadata = { generationId?: string | null; jobId?: string | null; stage?: string };

export function isGeminiTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

export function isRetryableGeminiStatus(status: number): boolean {
  return status === 408 || (status >= 500 && status <= 504);
}

const wait: Wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * One primary attempt plus at most one infrastructure retry. A configured
 * fallback model is used for that retry; otherwise the primary model is tried
 * once more. Quota/rate-limit responses are never amplified.
 */
export async function fetchGeminiWithFallback(
  fetchImplementation: typeof fetch,
  primaryModel: string,
  fallbackModel: string | null,
  endpointForModel: (model: string) => string,
  init: () => RequestInit,
  waitImplementation: Wait = wait,
  metadata: GeminiRetryMetadata = {},
): Promise<{ response: Response; model: string; attempts: number }> {
  const models = [primaryModel, fallbackModel && fallbackModel !== primaryModel ? fallbackModel : primaryModel];
  let lastError: unknown;

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    try {
      const response = await fetchImplementation(endpointForModel(model), init());
      const canRetry = index === 0 && isRetryableGeminiStatus(response.status);
      if (!canRetry) return { response, model, attempts: index + 1 };
      console.info(JSON.stringify({ event: "resume.gemini.retry", ...metadata, attempt: 1, nextAttempt: 2, responseStatus: Math.floor(response.status / 100) * 100, retryModel: models[1] }));
      await response.body?.cancel().catch(() => undefined);
    } catch (error) {
      lastError = error;
      if (index === models.length - 1) throw error;
      console.info(JSON.stringify({ event: "resume.gemini.retry", ...metadata, attempt: 1, nextAttempt: 2, responseStatus: "network", retryModel: models[1] }));
    }
    await waitImplementation(RETRY_DELAY_MS);
  }

  throw lastError ?? new Error("Gemini request ended without a response.");
}
