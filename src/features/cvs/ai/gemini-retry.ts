export type GeminiRetryMetadata = { generationId?: string | null; jobId?: string | null; stage?: string };

export function isRetryableGeminiStatus(status: number): boolean {
  return status === 408 || (status >= 500 && status <= 504);
}

/**
 * One primary attempt plus at most one retry after a retryable HTTP response
 * from Gemini. A configured fallback model is used for that retry; otherwise
 * the primary model is tried once more. Local timeouts and synthetic backoff
 * are deliberately absent: the caller waits for Gemini's response.
 */
export async function fetchGeminiWithFallback(
  fetchImplementation: typeof fetch,
  primaryModel: string,
  fallbackModel: string | null,
  endpointForModel: (model: string) => string,
  init: (model: string) => RequestInit,
  metadata: GeminiRetryMetadata = {},
): Promise<{ response: Response; model: string; attempts: number }> {
  const models = [primaryModel, fallbackModel && fallbackModel !== primaryModel ? fallbackModel : primaryModel];

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    const response = await fetchImplementation(endpointForModel(model), init(model));
    const canRetry = index === 0 && isRetryableGeminiStatus(response.status);
    if (!canRetry) return { response, model, attempts: index + 1 };
    console.info(JSON.stringify({ event: "resume.gemini.retry", ...metadata, attempt: 1, nextAttempt: 2, responseStatus: Math.floor(response.status / 100) * 100, retryModel: models[1] }));
    await response.body?.cancel().catch(() => undefined);
  }

  throw new Error("Gemini request ended without a response.");
}
