import {
  EMPLOYMENT_TYPES,
  WORK_MODES,
  type JobInput,
  type WorkMode,
} from "../jobs/types.ts";
import { normalizeSourceUrl } from "../jobs/domain.ts";
import type {
  ExternalSalary,
  JobSearchFilters,
  NormalizedExternalJob,
} from "../../lib/job-sources/types.ts";

const SOURCE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;
const EXTERNAL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const DISCOVERY_WORK_MODES = new Set<WorkMode>(["remote", "hybrid", "onsite"]);

function trimmed(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function parseDiscoveryFilters(value: unknown): JobSearchFilters | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const rawModes = Array.isArray(input.workModes) ? input.workModes : [];
  const workModes = rawModes.filter(
    (mode): mode is WorkMode => typeof mode === "string" && DISCOVERY_WORK_MODES.has(mode as WorkMode),
  );
  if (workModes.length !== rawModes.length) return null;
  return {
    keywords: trimmed(input.keywords, 120),
    location: trimmed(input.location, 120),
    workModes: [...new Set(workModes)],
  };
}

export function isValidExternalIdentity(source: unknown, externalId: unknown): boolean {
  return typeof source === "string"
    && SOURCE_ID_PATTERN.test(source)
    && typeof externalId === "string"
    && EXTERNAL_ID_PATTERN.test(externalId);
}

export function parseExternalJob(value: unknown): NormalizedExternalJob | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (!isValidExternalIdentity(input.source, input.externalId)) return null;
  const source = input.source === "justjoinit" ? input.source : null;
  const title = trimmed(input.title, 200);
  const company = trimmed(input.company, 200);
  const urlValue = trimmed(input.url, 2048);
  if (!source || title.length < 2 || company.length < 2 || !urlValue) return null;
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  if (source === "justjoinit" && (url.hostname !== "justjoin.it" || !url.pathname.startsWith("/job-offer/"))) return null;
  const workMode = typeof input.workMode === "string" && WORK_MODES.includes(input.workMode as WorkMode)
    ? input.workMode as WorkMode
    : null;
  const employmentType = typeof input.employmentType === "string"
    && EMPLOYMENT_TYPES.includes(input.employmentType as (typeof EMPLOYMENT_TYPES)[number])
    ? input.employmentType as (typeof EMPLOYMENT_TYPES)[number]
    : null;
  if (!workMode || !employmentType) return null;
  const postedAt = trimmed(input.postedAt, 50);
  if (postedAt && Number.isNaN(Date.parse(postedAt))) return null;
  const technologies = Array.isArray(input.technologies)
    ? [...new Set(input.technologies.flatMap((item) => {
        const technology = trimmed(item, 60);
        return technology ? [technology] : [];
      }))].slice(0, 50)
    : [];
  let salary: ExternalSalary | undefined;
  if (input.salary && typeof input.salary === "object") {
    const raw = input.salary as Record<string, unknown>;
    const min = typeof raw.min === "number" && Number.isFinite(raw.min) && raw.min >= 0 ? raw.min : undefined;
    const max = typeof raw.max === "number" && Number.isFinite(raw.max) && raw.max >= 0 ? raw.max : undefined;
    const currency = trimmed(raw.currency, 8);
    if (!currency || (min === undefined && max === undefined)) return null;
    salary = { min, max, currency, unit: trimmed(raw.unit, 20) || undefined };
  }
  return {
    source,
    sourceName: source === "justjoinit" ? "JustJoinIT" : trimmed(input.sourceName, 120),
    externalId: String(input.externalId),
    title,
    company,
    location: trimmed(input.location, 200),
    workMode,
    employmentType,
    salary,
    technologies,
    description: trimmed(input.description, 30_000),
    postedAt: postedAt || undefined,
    url: url.toString(),
  };
}

export function newestFirst(jobs: NormalizedExternalJob[]): NormalizedExternalJob[] {
  return [...jobs].sort((left, right) => {
    const leftTime = left.postedAt ? Date.parse(left.postedAt) : 0;
    const rightTime = right.postedAt ? Date.parse(right.postedAt) : 0;
    if (rightTime !== leftTime) return rightTime - leftTime;
    return left.externalId.localeCompare(right.externalId);
  });
}

export function filterKnownExternalJobs(
  jobs: NormalizedExternalJob[],
  known: { saved: Iterable<string>; ignored: Iterable<string>; savedUrls?: Iterable<string> },
): NormalizedExternalJob[] {
  const blocked = new Set([...known.saved, ...known.ignored]);
  const blockedUrls = new Set(
    known.savedUrls
      ? [...known.savedUrls].map(normalizeSourceUrl).filter(Boolean)
      : [],
  );
  const seen = new Set<string>();
  return jobs.filter((job) => {
    if (blocked.has(job.externalId) || blockedUrls.has(normalizeSourceUrl(job.url)) || seen.has(job.externalId)) return false;
    seen.add(job.externalId);
    return true;
  });
}

export function formatExternalSalary(salary?: ExternalSalary): string {
  if (!salary) return "";
  const amount = salary.min === salary.max || salary.max === undefined
    ? salary.min
    : salary.min === undefined
      ? salary.max
      : `${salary.min}–${salary.max}`;
  if (amount === undefined) return "";
  return `${amount} ${salary.currency}${salary.unit ? `/${salary.unit}` : ""}`;
}

export function externalJobToJobInput(job: NormalizedExternalJob): JobInput {
  return {
    title: job.title,
    company: job.company,
    status: "saved",
    source: job.sourceName,
    sourceUrl: job.url,
    externalSource: job.source,
    externalJobId: job.externalId,
    location: job.location,
    workMode: job.workMode,
    employmentType: job.employmentType,
    salary: formatExternalSalary(job.salary),
    description: job.description,
    technologies: job.technologies,
    notes: "",
    discoveredOn: job.postedAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    appliedOn: "",
  };
}
