import type { EmploymentType, WorkMode } from "@/features/jobs/types";
import type { ExternalSalary, NormalizedExternalJob } from "../types";

type UnknownRecord = Record<string, unknown>;

export type ParsedNoFluffSearchPage = {
  postings: UnknownRecord[];
  totalCount: number;
  totalPages: number;
};

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanString(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const text = cleanString(item, 120);
        return text ? [text] : [];
      })
    : [];
}

function placeRecords(value: unknown): UnknownRecord[] {
  if (!isRecord(value) || !Array.isArray(value.places)) return [];
  return value.places.filter(isRecord);
}

function normalizedLocation(value: unknown): string {
  const places = placeRecords(value);
  const cities = [...new Set(places.flatMap((place) => {
    const city = cleanString(place.city, 120);
    return city && city.toLocaleLowerCase("en") !== "remote" ? [city] : [];
  }))];
  const location = isRecord(value) ? value : {};
  if (cities.length === 0 && location.fullyRemote === true) return "Remote";
  const first = cities.slice(0, 3).join(", ");
  return cities.length > 3 ? `${first} +${cities.length - 3}`.slice(0, 200) : first.slice(0, 200);
}

function normalizedWorkMode(value: unknown): WorkMode {
  if (!isRecord(value)) return "unspecified";
  if (value.fullyRemote === true) return "remote";
  if (cleanString(value.hybridDesc, 200)) return "hybrid";
  return "onsite";
}

function normalizedSalary(value: unknown): ExternalSalary | undefined {
  if (!isRecord(value)) return undefined;
  const min = typeof value.from === "number" && Number.isFinite(value.from) && value.from >= 0
    ? value.from
    : undefined;
  const max = typeof value.to === "number" && Number.isFinite(value.to) && value.to >= 0
    ? value.to
    : undefined;
  const currency = cleanString(value.currency, 8);
  if (!currency || (min === undefined && max === undefined)) return undefined;
  return {
    min,
    max,
    currency,
    unit: cleanString(value.period, 20).toLocaleLowerCase("en") || undefined,
  };
}

function normalizedEmployment(value: unknown): EmploymentType {
  if (!isRecord(value)) return "unspecified";
  const type = cleanString(value.type, 40).toLocaleLowerCase("en");
  if (type === "permanent") return "full_time";
  if (type === "intern") return "internship";
  if (type === "b2b" || type === "mandate-contract" || type === "zlecenie" || type === "uod") {
    return "contract";
  }
  return "unspecified";
}

function normalizedTechnologies(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.values)) return [];
  const seen = new Set<string>();
  const output: string[] = [];
  for (const tile of value.values) {
    if (!isRecord(tile) || tile.type !== "requirement") continue;
    const technology = cleanString(tile.value, 60);
    const key = technology.toLocaleLowerCase("en");
    if (technology && !seen.has(key)) {
      seen.add(key);
      output.push(technology);
    }
    if (output.length === 50) break;
  }
  return output;
}

export function parseNoFluffSearchPage(value: unknown): ParsedNoFluffSearchPage {
  if (!isRecord(value) || !Array.isArray(value.postings)) {
    throw new Error("NoFluffJobs returned an unsupported search response.");
  }
  const totalCount = typeof value.totalCount === "number" && Number.isFinite(value.totalCount)
    ? Math.max(0, Math.trunc(value.totalCount))
    : value.postings.length;
  const totalPages = typeof value.totalPages === "number" && Number.isFinite(value.totalPages)
    ? Math.max(1, Math.trunc(value.totalPages))
    : 1;
  return {
    postings: value.postings.filter(isRecord),
    totalCount,
    totalPages,
  };
}

export function normalizeNoFluffPosting(value: UnknownRecord): NormalizedExternalJob | null {
  const externalId = cleanString(value.reference ?? value.id, 200);
  const slug = cleanString(value.url ?? value.id, 500);
  const title = cleanString(value.title, 200);
  const company = cleanString(value.name, 200);
  if (!externalId || !/^[A-Za-z0-9._:-]+$/.test(externalId) || !/^[A-Za-z0-9-]+$/.test(slug) || !title || !company) {
    return null;
  }
  const posted = typeof value.renewed === "number" && Number.isFinite(value.renewed)
    ? value.renewed
    : typeof value.posted === "number" && Number.isFinite(value.posted)
      ? value.posted
      : 0;
  return {
    source: "nofluffjobs",
    sourceName: "NoFluffJobs",
    externalId,
    title,
    company,
    location: normalizedLocation(value.location),
    workMode: normalizedWorkMode(value.location),
    employmentType: normalizedEmployment(value.salary),
    salary: normalizedSalary(value.salary),
    technologies: normalizedTechnologies(value.tiles),
    description: "",
    postedAt: posted > 0 ? new Date(posted).toISOString() : undefined,
    url: `https://nofluffjobs.com/pl/job/${encodeURIComponent(slug.toLocaleLowerCase("en"))}`,
  };
}

function decodeHtml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function htmlToText(value: unknown): string {
  return decodeHtml(cleanString(value, 60_000))
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|li|div|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseNoFluffJobDescription(value: unknown): string {
  if (!isRecord(value)) throw new Error("NoFluffJobs returned an unsupported job detail response.");
  const sections = [value.requirements, value.tasks, value.offer, value.aboutProject]
    .filter(isRecord)
    .flatMap((section) => [htmlToText(section.description)]);
  const description = [...new Set([htmlToText(value.description), ...sections].filter(Boolean))]
    .join("\n\n")
    .slice(0, 30_000);
  if (!description) throw new Error("NoFluffJobs returned a job without a readable description.");
  return description;
}

export function mergeNoFluffJobs(jobs: NormalizedExternalJob[]): NormalizedExternalJob[] {
  const merged = new Map<string, NormalizedExternalJob>();
  const modeRank: Record<WorkMode, number> = { unspecified: 0, onsite: 1, hybrid: 2, remote: 3 };
  for (const job of jobs) {
    const current = merged.get(job.externalId);
    if (!current) {
      merged.set(job.externalId, job);
      continue;
    }
    const locations = [...new Set(
      [current.location, job.location].flatMap((location) => location.split(/,\s*/)).filter(Boolean),
    )];
    merged.set(job.externalId, {
      ...current,
      location: locations.slice(0, 3).join(", ").slice(0, 200),
      workMode: modeRank[job.workMode] > modeRank[current.workMode] ? job.workMode : current.workMode,
      technologies: [...new Set([...current.technologies, ...job.technologies])].slice(0, 50),
    });
  }
  return [...merged.values()];
}

export function noFluffStringArray(value: unknown): string[] {
  return stringArray(value);
}
