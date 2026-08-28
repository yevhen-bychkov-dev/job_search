import type { JobSearchFilters } from "../types";

export const DOU_UNFILTERED_FEED_LIMIT = 50;
export const DOU_FILTERED_FEED_LIMIT = 25;

export function douFeedLimit(filters: JobSearchFilters): number {
  return filters.keywords || filters.location || filters.categories.length > 0
    ? DOU_FILTERED_FEED_LIMIT
    : DOU_UNFILTERED_FEED_LIMIT;
}

export function buildDouFeedUrl(filters: JobSearchFilters): URL {
  const url = new URL("https://jobs.dou.ua/vacancies/feeds/");
  const query = [filters.keywords.trim(), filters.location.trim()].filter(Boolean).join(" ");
  if (query) url.searchParams.set("search", query.slice(0, 240));
  if (filters.categories[0]) url.searchParams.set("category", filters.categories[0]);
  return url;
}
