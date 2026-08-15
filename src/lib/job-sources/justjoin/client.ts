import "server-only";

const MAX_RESPONSE_BYTES = 5_000_000;

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
  if (!response.ok) throw new Error(`JustJoinIT responded with ${response.status}.`);
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_RESPONSE_BYTES) throw new Error("JustJoinIT response was too large.");
  const html = await response.text();
  if (html.length > MAX_RESPONSE_BYTES) throw new Error("JustJoinIT response was too large.");
  return html;
}
