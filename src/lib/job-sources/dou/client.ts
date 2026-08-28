import "server-only";

const MAX_RESPONSE_BYTES = 5_000_000;

async function fetchDouText(url: URL, accept: string): Promise<string> {
  if (url.protocol !== "https:" || url.hostname !== "jobs.dou.ua") {
    throw new Error("Refused an unexpected DOU URL.");
  }
  const response = await fetch(url, {
    cache: "no-store",
    headers: { accept, "user-agent": "JobSearchOS/0.1 personal-job-discovery" },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`DOU responded with ${response.status}.`);
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_RESPONSE_BYTES) throw new Error("DOU response was too large.");
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error("DOU response was too large.");
  return text;
}

export function fetchDouFeed(url: URL): Promise<string> {
  if (url.pathname !== "/vacancies/feeds/") throw new Error("Refused an unexpected DOU feed URL.");
  return fetchDouText(url, "application/rss+xml, application/xml, text/xml");
}

export function fetchDouHtml(url: URL): Promise<string> {
  if (!/^\/companies\/[^/]+\/vacancies\/\d+\/?$/.test(url.pathname)) {
    throw new Error("Refused an unexpected DOU vacancy URL.");
  }
  return fetchDouText(url, "text/html, application/xhtml+xml");
}
