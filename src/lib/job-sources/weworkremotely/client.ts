import "server-only";

const MAX_RESPONSE_BYTES = 5_000_000;

async function fetchWeWorkRemotelyText(url: URL, accept: string): Promise<string> {
  if (url.protocol !== "https:" || url.hostname !== "weworkremotely.com") {
    throw new Error("Refused an unexpected We Work Remotely URL.");
  }
  const response = await fetch(url, {
    cache: "no-store",
    headers: { accept, "user-agent": "JobSearchOS/0.1 personal-job-discovery" },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`We Work Remotely responded with ${response.status}.`);
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_RESPONSE_BYTES) throw new Error("We Work Remotely response was too large.");
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error("We Work Remotely response was too large.");
  return text;
}

export function fetchWeWorkRemotelyFeed(url: URL): Promise<string> {
  if (!url.pathname.endsWith(".rss")) throw new Error("Refused an unexpected We Work Remotely feed URL.");
  return fetchWeWorkRemotelyText(url, "application/rss+xml, application/xml, text/xml");
}

export function fetchWeWorkRemotelyHtml(url: URL): Promise<string> {
  if (!url.pathname.startsWith("/remote-jobs/")) throw new Error("Refused an unexpected We Work Remotely vacancy URL.");
  return fetchWeWorkRemotelyText(url, "text/html, application/xhtml+xml");
}
