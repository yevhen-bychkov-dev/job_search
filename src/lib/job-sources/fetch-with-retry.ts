const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

type FetchWithRetryOptions = {
  attempts?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
  fetcher?: typeof fetch;
  wait?: (delayMs: number) => Promise<void>;
};

function retryAfterMs(response: Response): number | null {
  const value = response.headers.get("retry-after");
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : Math.max(0, timestamp - Date.now());
}

function defaultWait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Retries a bounded read-only provider request after transient HTTP or network
 * failures. Callers remain responsible for using this only with safe requests.
 */
export async function fetchWithTransientRetry(
  input: URL | string,
  init: RequestInit,
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const attempts = Math.max(1, Math.trunc(options.attempts ?? 3));
  const timeoutMs = Math.max(1, Math.trunc(options.timeoutMs ?? 12_000));
  const baseDelayMs = Math.max(0, Math.trunc(options.baseDelayMs ?? 200));
  const fetcher = options.fetcher ?? fetch;
  const wait = options.wait ?? defaultWait;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetcher(input, {
        ...init,
        signal: init.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)])
          : AbortSignal.timeout(timeoutMs),
      });
      if (!RETRYABLE_STATUSES.has(response.status) || attempt === attempts) return response;
      const delayMs = Math.min(2_000, retryAfterMs(response) ?? baseDelayMs * (2 ** (attempt - 1)));
      await response.body?.cancel();
      await wait(delayMs);
    } catch (error) {
      lastError = error;
      if (attempt === attempts || init.signal?.aborted) throw error;
      await wait(Math.min(2_000, baseDelayMs * (2 ** (attempt - 1))));
    }
  }

  throw lastError;
}
