const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 1_000;
const MAX_RETRY_AFTER_MS = 15_000;

type Wait = (milliseconds: number) => Promise<void>;

export function isGeminiTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

export function isRetryableGeminiStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function retryDelay(response: Response, retryIndex: number, random: () => number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, MAX_RETRY_AFTER_MS);
  }
  const exponentialDelay = BASE_DELAY_MS * (2 ** retryIndex);
  const jitterMultiplier = 0.75 + (random() * 0.5);
  return Math.round(exponentialDelay * jitterMultiplier);
}

const wait: Wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function fetchGeminiWithRetry(
  fetchImplementation: typeof fetch,
  endpoint: string,
  init: () => RequestInit,
  waitImplementation: Wait = wait,
  random: () => number = Math.random,
): Promise<Response> {
  let lastNetworkError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImplementation(endpoint, init());
      if (response.ok || !isRetryableGeminiStatus(response.status) || attempt === MAX_ATTEMPTS - 1) return response;
      const delay = retryDelay(response, attempt, random);
      await response.body?.cancel().catch(() => undefined);
      await waitImplementation(delay);
    } catch (error) {
      lastNetworkError = error;
      if (isGeminiTimeout(error) || attempt === MAX_ATTEMPTS - 1) throw error;
      const jitterMultiplier = 0.75 + (random() * 0.5);
      await waitImplementation(Math.round(BASE_DELAY_MS * (2 ** attempt) * jitterMultiplier));
    }
  }
  throw lastNetworkError ?? new Error("Gemini retry loop ended without a response.");
}

export async function fetchGeminiWithFallback(
  fetchImplementation: typeof fetch,
  primaryModel: string,
  fallbackModel: string | null,
  endpointForModel: (model: string) => string,
  init: () => RequestInit,
  waitImplementation: Wait = wait,
  random: () => number = Math.random,
): Promise<{ response: Response; model: string }> {
  const primaryResponse = await fetchGeminiWithRetry(
    fetchImplementation,
    endpointForModel(primaryModel),
    init,
    waitImplementation,
    random,
  );
  if (primaryResponse.status !== 503 || !fallbackModel || fallbackModel === primaryModel) {
    return { response: primaryResponse, model: primaryModel };
  }
  await primaryResponse.body?.cancel().catch(() => undefined);
  const fallbackResponse = await fetchGeminiWithRetry(
    fetchImplementation,
    endpointForModel(fallbackModel),
    init,
    waitImplementation,
    random,
  );
  return { response: fallbackResponse, model: fallbackModel };
}
