const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;
const MAX_RETRY_AFTER_MS = 5_000;

type Wait = (milliseconds: number) => Promise<void>;

export function isGeminiTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

export function isRetryableGeminiStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function retryDelay(response: Response, retryIndex: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, MAX_RETRY_AFTER_MS);
  }
  return BASE_DELAY_MS * (2 ** retryIndex);
}

const wait: Wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function fetchGeminiWithRetry(
  fetchImplementation: typeof fetch,
  endpoint: string,
  init: () => RequestInit,
  waitImplementation: Wait = wait,
): Promise<Response> {
  let lastNetworkError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImplementation(endpoint, init());
      if (response.ok || !isRetryableGeminiStatus(response.status) || attempt === MAX_ATTEMPTS - 1) return response;
      const delay = retryDelay(response, attempt);
      await response.body?.cancel().catch(() => undefined);
      await waitImplementation(delay);
    } catch (error) {
      lastNetworkError = error;
      if (isGeminiTimeout(error) || attempt === MAX_ATTEMPTS - 1) throw error;
      await waitImplementation(BASE_DELAY_MS * (2 ** attempt));
    }
  }
  throw lastNetworkError ?? new Error("Gemini retry loop ended without a response.");
}
