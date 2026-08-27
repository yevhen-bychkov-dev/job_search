import "server-only";

const MAX_RESPONSE_BYTES = 5_000_000;

async function checkedResponseText(response: Response, source: string): Promise<string> {
  if (!response.ok) throw new Error(`${source} responded with ${response.status}.`);
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_RESPONSE_BYTES) throw new Error(`${source} response was too large.`);
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error(`${source} response was too large.`);
  return text;
}

export async function fetchJustJoinHtml(url: URL): Promise<string> {
  if (url.protocol !== "https:" || url.hostname !== "justjoin.it") {
    throw new Error("Refused an unexpected JustJoinIT URL.");
  }
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "JobSearchOS/0.1 personal-job-discovery",
    },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  return checkedResponseText(response, "JustJoinIT");
}

export async function fetchJustJoinSearchPage(url: URL): Promise<unknown> {
  if (url.protocol !== "https:" || url.hostname !== "justjoin.it" || url.pathname !== "/api/candidate-api/offers") {
    throw new Error("Refused an unexpected JustJoinIT search URL.");
  }
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      accept: "application/json",
      "user-agent": "JobSearchOS/0.1 personal-job-discovery",
    },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  const text = await checkedResponseText(response, "JustJoinIT");
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error("JustJoinIT returned invalid JSON.", { cause: error });
  }
}
