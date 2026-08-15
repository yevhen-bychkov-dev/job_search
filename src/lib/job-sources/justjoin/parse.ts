import type { JustJoinOffer } from "./normalize";

type UnknownRecord = Record<string, unknown>;

export type ParsedJustJoinSearch = {
  offers: JustJoinOffer[];
  totalItems: number;
  batchSize: number;
  hasMore: boolean;
};

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function findPages(value: unknown): UnknownRecord | null {
  if (isRecord(value) && Array.isArray(value.pages)) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findPages(item);
      if (found) return found;
    }
  } else if (isRecord(value)) {
    for (const item of Object.values(value)) {
      const found = findPages(item);
      if (found) return found;
    }
  }
  return null;
}

function flightValues(html: string): unknown[] {
  const values: unknown[] = [];
  const scriptPattern = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    const script = match[1];
    const marker = "self.__next_f.push(";
    const markerIndex = script.indexOf(marker);
    if (markerIndex < 0) continue;
    const argument = script.slice(markerIndex + marker.length, script.lastIndexOf(")"));
    try {
      const payload = JSON.parse(argument) as unknown;
      if (!Array.isArray(payload) || typeof payload[1] !== "string") continue;
      for (const line of payload[1].split("\n")) {
        const separator = line.indexOf(":");
        if (separator < 0) continue;
        const candidate = line.slice(separator + 1).trim();
        if (!candidate.startsWith("[") && !candidate.startsWith("{")) continue;
        try {
          values.push(JSON.parse(candidate));
        } catch {
          // Other React Flight records can use non-JSON wire syntax.
        }
      }
    } catch {
      // Ignore unrelated or partial script payloads.
    }
  }
  return values;
}

export function parseJustJoinSearchHtml(html: string): ParsedJustJoinSearch {
  for (const value of flightValues(html)) {
    const container = findPages(value);
    const page = Array.isArray(container?.pages) && isRecord(container.pages[0])
      ? container.pages[0]
      : null;
    if (!page || !Array.isArray(page.data)) continue;
    const meta = isRecord(page.meta) ? page.meta : {};
    const next = isRecord(meta.next) ? meta.next : {};
    const totalItems = typeof meta.totalItems === "number" ? meta.totalItems : page.data.length;
    return {
      offers: page.data.filter(isRecord) as JustJoinOffer[],
      totalItems,
      batchSize: page.data.length,
      hasMore: typeof next.cursor === "number" && next.cursor < totalItems,
    };
  }
  throw new Error("JustJoinIT returned an unsupported search page format.");
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function parseJustJoinDescriptionHtml(html: string): string {
  const pattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    try {
      const data = JSON.parse(match[1]) as UnknownRecord;
      if (data["@type"] === "JobPosting" && typeof data.description === "string") {
        return decodeEntities(data.description).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 30_000);
      }
    } catch {
      // Continue to another JSON-LD block.
    }
  }
  throw new Error("JustJoinIT returned an unsupported job detail format.");
}
