import type { JustJoinOffer } from "./normalize";

type UnknownRecord = Record<string, unknown>;

export type ParsedJustJoinSearch = {
  offers: JustJoinOffer[];
  totalItems: number;
  batchSize: number;
  hasMore: boolean;
};

export function parseJustJoinSearchResponse(value: unknown): ParsedJustJoinSearch {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    throw new Error("JustJoinIT returned an unsupported search response.");
  }
  const meta = isRecord(value.meta) ? value.meta : {};
  const next = isRecord(meta.next) ? meta.next : {};
  const totalItems = typeof meta.totalItems === "number" && Number.isFinite(meta.totalItems)
    ? Math.max(0, Math.trunc(meta.totalItems))
    : value.data.length;
  return {
    offers: value.data.filter(isRecord) as JustJoinOffer[],
    totalItems,
    batchSize: value.data.length,
    hasMore: typeof next.cursor === "number" && next.cursor < totalItems,
  };
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
