import type { JobSearchFilters } from "../types";

export const WE_WORK_REMOTELY_FEEDS = {
  programming: "/categories/remote-programming-jobs.rss",
  "full-stack": "/categories/remote-full-stack-programming-jobs.rss",
  "front-end": "/categories/remote-front-end-programming-jobs.rss",
  "back-end": "/categories/remote-back-end-programming-jobs.rss",
  devops: "/categories/remote-devops-sysadmin-jobs.rss",
  product: "/categories/remote-product-jobs.rss",
  design: "/categories/remote-design-jobs.rss",
  "customer-support": "/categories/remote-customer-support-jobs.rss",
  "sales-marketing": "/categories/remote-sales-and-marketing-jobs.rss",
  "management-finance": "/categories/remote-management-and-finance-jobs.rss",
  other: "/categories/all-other-remote-jobs.rss",
} as const;

export type WeWorkRemotelyCategory = keyof typeof WE_WORK_REMOTELY_FEEDS;

export function buildWeWorkRemotelyFeedUrl(filters: JobSearchFilters): URL {
  const category = filters.categories[0] as WeWorkRemotelyCategory | undefined;
  return new URL(category && category in WE_WORK_REMOTELY_FEEDS
    ? WE_WORK_REMOTELY_FEEDS[category]
    : "/remote-jobs.rss", "https://weworkremotely.com");
}
