import type { JobSearchFilters } from "../types";

const SEARCH_ENDPOINT = "https://nofluffjobs.com/api/search/posting";
export const NO_FLUFF_PAGE_SIZE = 100;
export const MAX_NO_FLUFF_SEARCH_PAGES = 5;
export const MAX_NO_FLUFF_RESULTS = 500;

function locationSlug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

export function buildNoFluffSearchRequest(filters: JobSearchFilters, page: number): {
  url: URL;
  body: string;
} {
  const url = new URL(SEARCH_ENDPOINT);
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(NO_FLUFF_PAGE_SIZE));
  url.searchParams.set("region", "pl");
  url.searchParams.set("sort", "newest");
  url.searchParams.set("salaryCurrency", "PLN");
  url.searchParams.set("salaryPeriod", "month");
  const location = locationSlug(filters.location);
  const remoteOnly = filters.workModes.length === 1 && filters.workModes[0] === "remote";
  return {
    url,
    body: JSON.stringify({
      criteriaSearch: {
        keyword: filters.keywords ? [filters.keywords] : [],
        city: location ? [location] : remoteOnly ? ["remote"] : [],
        category: filters.categories,
        requirement: filters.technologies,
        seniority: filters.seniorities,
      },
    }),
  };
}

export function noFluffPagesToFetch(totalPages: number): number {
  return Math.min(Math.max(1, Math.trunc(totalPages)), MAX_NO_FLUFF_SEARCH_PAGES);
}
