import "server-only";

import { newestFirst } from "@/features/job-discovery/domain";
import { isPlaywrightTestMode } from "@/lib/supabase/environment";

import type { ExternalJobSearchResult, JobSearchFilters, JobSourceAdapter, NormalizedExternalJob } from "../types";
import { fetchWeWorkRemotelyFeed, fetchWeWorkRemotelyHtml } from "./client";
import { normalizeWeWorkRemotelyFeed, parseWeWorkRemotelyDescriptionHtml } from "./normalize";
import { buildWeWorkRemotelyFeedUrl } from "./search";

export const WE_WORK_REMOTELY_FILTER_OPTIONS = {
  categories: [
    { value: "programming", label: "All programming" },
    { value: "full-stack", label: "Full-stack programming" },
    { value: "front-end", label: "Front-end programming" },
    { value: "back-end", label: "Back-end programming" },
    { value: "devops", label: "DevOps and sysadmin" },
    { value: "product", label: "Product" },
    { value: "design", label: "Design" },
    { value: "customer-support", label: "Customer support" },
    { value: "sales-marketing", label: "Sales and marketing" },
    { value: "management-finance", label: "Management and finance" },
    { value: "other", label: "All other" },
  ],
  technologies: [],
  seniorities: [],
} as const;

const SYNTHETIC_JOBS: NormalizedExternalJob[] = [{
  source: "weworkremotely", sourceName: "We Work Remotely", externalId: "synthetic-remote-typescript-engineer",
  title: "Remote TypeScript Engineer", company: "Synthetic Global Product Co", location: "European Union",
  workMode: "remote", employmentType: "full_time", technologies: ["TypeScript", "React"],
  description: "Synthetic We Work Remotely vacancy used only by isolated end-to-end tests.",
  postedAt: "2026-08-17T09:00:00.000Z",
  url: "https://weworkremotely.com/remote-jobs/synthetic-global-product-co-remote-typescript-engineer",
}];

function matchesSynthetic(job: NormalizedExternalJob, filters: JobSearchFilters): boolean {
  const keyword = filters.keywords.toLocaleLowerCase("en");
  const location = filters.location.toLocaleLowerCase("en");
  return (!keyword || [job.title, ...job.technologies].some((value) => value.toLocaleLowerCase("en").includes(keyword)))
    && (!location || job.location.toLocaleLowerCase("en").includes(location));
}

export class WeWorkRemotelyAdapter implements JobSourceAdapter {
  readonly id = "weworkremotely" as const;
  readonly name = "We Work Remotely";
  readonly websiteUrl = "https://weworkremotely.com/remote-jobs";
  readonly supportedWorkModes = ["remote"] as const;
  readonly filterOptions = WE_WORK_REMOTELY_FILTER_OPTIONS;

  async searchJobs(filters: JobSearchFilters): Promise<ExternalJobSearchResult> {
    if (isPlaywrightTestMode()) {
      const jobs = newestFirst(SYNTHETIC_JOBS.filter((job) => matchesSynthetic(job, filters)));
      return { jobs, sourceResultCount: jobs.length, sourceBatchLimit: jobs.length, sourceHasMore: false };
    }
    const xml = await fetchWeWorkRemotelyFeed(buildWeWorkRemotelyFeedUrl(filters));
    const jobs = newestFirst(normalizeWeWorkRemotelyFeed(xml, filters));
    const feedCount = (xml.match(/<item(?:\s|>)/gi) ?? []).length;
    return { jobs, sourceResultCount: jobs.length, sourceBatchLimit: feedCount, sourceHasMore: false };
  }

  async getJobDetails(job: Pick<NormalizedExternalJob, "externalId" | "url">): Promise<{ description: string }> {
    if (isPlaywrightTestMode()) return { description: SYNTHETIC_JOBS[0]?.description ?? "Synthetic remote vacancy." };
    const url = new URL(job.url);
    return { description: parseWeWorkRemotelyDescriptionHtml(await fetchWeWorkRemotelyHtml(url)) };
  }
}
