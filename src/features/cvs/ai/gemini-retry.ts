const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 1_000;
const MAX_RETRY_AFTER_MS = 15_000;

type Wait = (milliseconds: number) => Promise<void>;
export type GeminiRetryMetadata = { generationId?: string | null; jobId?: string | null; stage?: string; model?: string };

export function isGeminiTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

export function isRetryableGeminiStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 504);
}

function retryAfterDelay(response: Response): number | null {
  const retryAfter = response.headers.get("retry-after");
  if (!retryAfter) return null;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, MAX_RETRY_AFTER_MS);
  const timestamp = Date.parse(retryAfter);
  return Number.isFinite(timestamp) ? Math.min(Math.max(0, timestamp - Date.now()), MAX_RETRY_AFTER_MS) : null;
}

function retryDelay(response: Response, retryIndex: number, random: () => number): number | null {
  const retryAfter = retryAfterDelay(response);
  if (retryAfter !== null) return retryAfter;
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
  metadata: GeminiRetryMetadata = {},
): Promise<Response> {
  let lastNetworkError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImplementation(endpoint, init());
      if (response.ok || !isRetryableGeminiStatus(response.status) || attempt === MAX_ATTEMPTS - 1) return response;
      const delay = retryDelay(response, attempt, random);
      if (delay === null) return response;
      console.info(JSON.stringify({ event: "resume.gemini.retry", ...metadata, attempt: attempt + 1, nextAttempt: attempt + 2, responseStatus: Math.floor(response.status / 100) * 100, retryDelayMs: delay }));
      await response.body?.cancel().catch(() => undefined);
      await waitImplementation(delay);
    } catch (error) {
      lastNetworkError = error;
      if (attempt === MAX_ATTEMPTS - 1) throw error;
      const jitterMultiplier = 0.75 + (random() * 0.5);
      const delay = Math.round(BASE_DELAY_MS * (2 ** attempt) * jitterMultiplier);
      console.info(JSON.stringify({ event: "resume.gemini.retry", ...metadata, attempt: attempt + 1, nextAttempt: attempt + 2, responseStatus: "network", retryDelayMs: delay }));
      await waitImplementation(delay);
    }
  }
  throw lastNetworkError ?? new Error("Gemini retry loop ended without a response.");
}

let activeGeminiRequests = 0;
const queuedGeminiRequests: Array<() => void> = [];

/** Keep free-tier Gemini traffic serialized across resume operations. */
export async function withGeminiConcurrency<T>(work: () => Promise<T>): Promise<T> {
  if (activeGeminiRequests >= 1) await new Promise<void>((resolve) => queuedGeminiRequests.push(resolve));
  activeGeminiRequests += 1;
  try {
    return await work();
  } finally {
    activeGeminiRequests -= 1;
    queuedGeminiRequests.shift()?.();
  }
}

export async function fetchGeminiWithFallback(
  fetchImplementation: typeof fetch,
  primaryModel: string,
  fallbackModel: string | null,
  endpointForModel: (model: string) => string,
  init: () => RequestInit,
  waitImplementation: Wait = wait,
  random: () => number = Math.random,
  metadata: GeminiRetryMetadata = {},
): Promise<{ response: Response; model: string }> {
  const primaryResponse = await fetchGeminiWithRetry(
    fetchImplementation,
    endpointForModel(primaryModel),
    init,
    waitImplementation,
    random,
    { ...metadata, model: primaryModel },
  );
  const shouldUseFallback = primaryResponse.status === 429 || primaryResponse.status === 503;
  if (!shouldUseFallback || !fallbackModel || fallbackModel === primaryModel) {
    return { response: primaryResponse, model: primaryModel };
  }
  await primaryResponse.body?.cancel().catch(() => undefined);
  const fallbackResponse = await fetchGeminiWithRetry(
    fetchImplementation,
    endpointForModel(fallbackModel),
    init,
    waitImplementation,
    random,
    { ...metadata, model: fallbackModel },
  );
  return { response: fallbackResponse, model: fallbackModel };
}
