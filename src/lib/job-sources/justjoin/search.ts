import type { JobSearchFilters } from "../types";

export const JUST_JOIN_PAGE_SIZE = 100;
export const MAX_JUST_JOIN_SEARCH_PAGES = 5;

export function buildJustJoinSearchUrl(filters: JobSearchFilters, from = 0): URL {
  const url = new URL("https://justjoin.it/api/candidate-api/offers");
  url.searchParams.set("from", String(Math.max(0, Math.trunc(from))));
  url.searchParams.set("itemsCount", String(JUST_JOIN_PAGE_SIZE));
  url.searchParams.set("sortBy", "publishedAt");
  url.searchParams.set("orderBy", "descending");
  if (filters.keywords) {
    url.searchParams.set("keywords", filters.keywords);
    url.searchParams.set("keywordType", "any");
  }
  if (filters.location) url.searchParams.set("city", filters.location);
  filters.categories.forEach((category) => url.searchParams.append("categories", category));
  filters.workModes.forEach((mode) => {
    url.searchParams.append("remoteWorkOptions", mode === "onsite" ? "office" : mode);
  });
  filters.seniorities.forEach((seniority) => url.searchParams.append("experienceLevels", seniority));
  return url;
}

export function justJoinPagesToFetch(totalItems: number): number {
  return Math.min(
    Math.max(1, Math.ceil(Math.max(0, Math.trunc(totalItems)) / JUST_JOIN_PAGE_SIZE)),
    MAX_JUST_JOIN_SEARCH_PAGES,
  );
}
