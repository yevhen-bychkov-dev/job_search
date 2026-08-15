import type { JobInput, ValidationResult } from "../jobs/types.ts";
import { DEFAULT_FILTER_SETTINGS, type FilterSettings } from "./types.ts";

function uniqueList(value: unknown): string[] {
  const source = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : typeof value === "string"
      ? value.split(/[\n,;|]/)
      : [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of source) {
    const item = raw.trim().slice(0, 80);
    const key = item.toLocaleLowerCase("en");
    if (item && !seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
    if (result.length === 50) break;
  }
  return result;
}

export function parseFilterSettings(
  input: Record<string, unknown>,
  updatedAt = new Date().toISOString(),
): ValidationResult<FilterSettings> {
  const includedTechnologies = uniqueList(input.includedTechnologies);
  const excludedTechnologies = uniqueList(input.excludedTechnologies);
  const preferredTitles = uniqueList(input.preferredTitles);
  const overlap = includedTechnologies.find((included) =>
    excludedTechnologies.some(
      (excluded) => excluded.toLocaleLowerCase("en") === included.toLocaleLowerCase("en"),
    ),
  );
  if (overlap) {
    return {
      ok: false,
      errors: {
        excludedTechnologies: `${overlap} cannot be both included and excluded.`,
      },
    };
  }
  return {
    ok: true,
    data: { includedTechnologies, excludedTechnologies, preferredTitles, updatedAt },
  };
}

export function createDefaultFilterSettings(now = new Date().toISOString()): FilterSettings {
  return { ...DEFAULT_FILTER_SETTINGS, updatedAt: now };
}

export function jobMatchesFilters(job: JobInput, filters: FilterSettings): boolean {
  const haystack = `${job.title} ${job.description} ${job.technologies.join(" ")}`.toLocaleLowerCase("en");
  const excluded = filters.excludedTechnologies.some((item) =>
    haystack.includes(item.toLocaleLowerCase("en")),
  );
  if (excluded) return false;

  const includedMatch =
    filters.includedTechnologies.length === 0 ||
    filters.includedTechnologies.some((item) =>
      haystack.includes(item.toLocaleLowerCase("en")),
    );
  const titleMatch =
    filters.preferredTitles.length === 0 ||
    filters.preferredTitles.some((item) =>
      job.title.toLocaleLowerCase("en").includes(item.toLocaleLowerCase("en")),
    );
  return includedMatch && titleMatch;
}
