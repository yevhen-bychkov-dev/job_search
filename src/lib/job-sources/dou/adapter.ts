import "server-only";

import { newestFirst } from "@/features/job-discovery/domain";
import { isPlaywrightTestMode } from "@/lib/supabase/environment";

import type { ExternalJobSearchResult, JobSearchFilters, JobSourceAdapter, NormalizedExternalJob } from "../types";
import { fetchDouFeed, fetchDouHtml } from "./client";
import { normalizeDouFeed, parseDouDescriptionHtml } from "./normalize";
import { buildDouFeedUrl, douFeedLimit } from "./search";

export const DOU_FILTER_OPTIONS = {
  categories: [
    ".NET", "AI/ML", "Android", "Architect", "Big Data", "C++", "Data Engineer", "Data Science",
    "DevOps", "Embedded", "Engineering Manager", "Flutter", "Front End", "Golang", "iOS/macOS",
    "Java", "Node.js", "PHP", "Product Manager", "Project Manager", "Python", "QA", "React Native",
    "Ruby", "Rust", "Scala", "Security", "SysAdmin",
  ].map((value) => ({ value, label: value })),
  technologies: [],
  seniorities: [],
} as const;

const SYNTHETIC_JOBS: NormalizedExternalJob[] = [{
  source: "dou", sourceName: "DOU", externalId: "400001", title: "Senior React Engineer",
  company: "Synthetic DOU Studio", location: "Warszawa, remote", workMode: "remote",
  employmentType: "full_time", technologies: ["React", "TypeScript"],
  description: "Synthetic DOU vacancy used only by isolated end-to-end tests.",
  postedAt: "2026-08-16T09:00:00.000Z",
  url: "https://jobs.dou.ua/companies/synthetic-dou-studio/vacancies/400001/",
}];

function matchesSynthetic(job: NormalizedExternalJob, filters: JobSearchFilters): boolean {
  const keyword = filters.keywords.toLocaleLowerCase("en");
  const location = filters.location.toLocaleLowerCase("en");
  return (!keyword || [job.title, ...job.technologies].some((value) => value.toLocaleLowerCase("en").includes(keyword)))
    && (!location || job.location.toLocaleLowerCase("en").includes(location))
    && (filters.workModes.length === 0 || filters.workModes.includes(job.workMode));
}

export class DouAdapter implements JobSourceAdapter {
  readonly id = "dou" as const;
  readonly name = "DOU";
  readonly websiteUrl = "https://jobs.dou.ua/vacancies/";
  readonly supportedWorkModes = ["remote", "hybrid", "onsite"] as const;
  readonly filterOptions = DOU_FILTER_OPTIONS;

  async searchJobs(filters: JobSearchFilters): Promise<ExternalJobSearchResult> {
    if (isPlaywrightTestMode()) {
      const jobs = newestFirst(SYNTHETIC_JOBS.filter((job) => matchesSynthetic(job, filters)));
      return { jobs, sourceResultCount: jobs.length, sourceBatchLimit: douFeedLimit(filters), sourceHasMore: false };
    }
    const xml = await fetchDouFeed(buildDouFeedUrl(filters));
    const jobs = newestFirst(normalizeDouFeed(xml, filters));
    const feedCount = (xml.match(/<item(?:\s|>)/gi) ?? []).length;
    return {
      jobs,
      sourceResultCount: jobs.length,
      sourceBatchLimit: feedCount,
      sourceHasMore: feedCount >= douFeedLimit(filters),
    };
  }

  async getJobDetails(job: Pick<NormalizedExternalJob, "externalId" | "url">): Promise<{ description: string }> {
    if (isPlaywrightTestMode()) return { description: SYNTHETIC_JOBS[0]?.description ?? "Synthetic DOU vacancy." };
    const url = new URL(job.url);
    return { description: parseDouDescriptionHtml(await fetchDouHtml(url)) };
  }
}
