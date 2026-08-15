import type { EmploymentType, WorkMode } from "../../../features/jobs/types.ts";
import type { ExternalSalary, NormalizedExternalJob } from "../types";

export type JustJoinEmployment = {
  from?: number | null;
  to?: number | null;
  currency?: string | null;
  currencySource?: string | null;
  type?: string | null;
  unit?: string | null;
};

export type JustJoinOffer = {
  guid?: unknown;
  slug?: unknown;
  title?: unknown;
  body?: unknown;
  companyName?: unknown;
  city?: unknown;
  workplaceType?: unknown;
  workingTime?: unknown;
  publishedAt?: unknown;
  requiredSkills?: unknown;
  niceToHaveSkills?: unknown;
  employmentTypes?: unknown;
};

function cleanString(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function workMode(value: unknown): WorkMode {
  if (value === "remote" || value === "hybrid") return value;
  if (value === "office" || value === "onsite") return "onsite";
  return "unspecified";
}

function employmentType(value: unknown): EmploymentType {
  if (value === "full_time") return "full_time";
  if (value === "part_time") return "part_time";
  if (value === "internship") return "internship";
  if (value === "b2b" || value === "permanent") return "contract";
  return "unspecified";
}

function salary(value: unknown): ExternalSalary | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries = value.filter((entry): entry is JustJoinEmployment => Boolean(entry) && typeof entry === "object");
  const original = entries.find((entry) => entry.currencySource === "original") ?? entries[0];
  if (!original || (typeof original.from !== "number" && typeof original.to !== "number")) return undefined;
  return {
    min: typeof original.from === "number" ? original.from : undefined,
    max: typeof original.to === "number" ? original.to : undefined,
    currency: cleanString(original.currency, 8) || "PLN",
    unit: cleanString(original.unit, 20) || undefined,
  };
}

function technologies(...values: unknown[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      const technology = cleanString(item, 60);
      const key = technology.toLocaleLowerCase("en");
      if (technology && !seen.has(key)) {
        seen.add(key);
        output.push(technology);
      }
      if (output.length === 50) return output;
    }
  }
  return output;
}

export function normalizeJustJoinOffer(value: JustJoinOffer): NormalizedExternalJob | null {
  const externalId = cleanString(value.guid, 200);
  const slug = cleanString(value.slug, 500);
  const title = cleanString(value.title ?? value.body, 200);
  const company = cleanString(value.companyName, 200);
  if (!externalId || !slug || !title || !company) return null;
  const publishedAt = cleanString(value.publishedAt, 50);
  return {
    source: "justjoinit",
    sourceName: "JustJoinIT",
    externalId,
    title,
    company,
    location: cleanString(value.city, 200),
    workMode: workMode(value.workplaceType),
    employmentType: employmentType(value.workingTime),
    salary: salary(value.employmentTypes),
    technologies: technologies(value.requiredSkills, value.niceToHaveSkills),
    description: "",
    postedAt: publishedAt && !Number.isNaN(Date.parse(publishedAt)) ? publishedAt : undefined,
    url: `https://justjoin.it/job-offer/${encodeURIComponent(slug)}`,
  };
}
