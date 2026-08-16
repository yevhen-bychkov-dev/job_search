import "server-only";

import { newestFirst } from "@/features/job-discovery/domain";
import { isPlaywrightTestMode } from "@/lib/supabase/environment";
import type {
  ExternalJobSearchResult,
  JobSearchFilters,
  JobSourceAdapter,
  NormalizedExternalJob,
} from "../types";
import {
  fetchNoFluffJobDetails,
  fetchNoFluffSearchPage,
} from "./client";
import {
  mergeNoFluffJobs,
  normalizeNoFluffPosting,
  parseNoFluffJobDescription,
} from "./normalize";
import { MAX_NO_FLUFF_SEARCH_PAGES, noFluffPagesToFetch } from "./search";

const PAGE_SIZE = 50;
const PAGE_CONCURRENCY = 3;

export const NO_FLUFF_FILTER_OPTIONS = {
  categories: [
    { value: "frontend", label: "Frontend" },
    { value: "fullstack", label: "Fullstack" },
    { value: "backend", label: "Backend" },
    { value: "mobile", label: "Mobile" },
    { value: "testing", label: "Testing" },
    { value: "devops", label: "DevOps" },
    { value: "data", label: "Data" },
    { value: "artificial-intelligence", label: "AI / ML" },
    { value: "security", label: "Security" },
    { value: "architecture", label: "Architecture" },
  ],
  technologies: [
    { value: "javascript", label: "JavaScript" },
    { value: "typescript", label: "TypeScript" },
    { value: "react", label: "React" },
    { value: "next.js", label: "Next.js" },
    { value: "angular", label: "Angular" },
    { value: "vue.js", label: "Vue.js" },
    { value: "node.js", label: "Node.js" },
    { value: "html", label: "HTML" },
    { value: "css", label: "CSS" },
    { value: "python", label: "Python" },
    { value: "java", label: "Java" },
    { value: ".net", label: ".NET" },
  ],
  seniorities: [
    { value: "trainee", label: "Trainee" },
    { value: "junior", label: "Junior" },
    { value: "mid", label: "Mid" },
    { value: "senior", label: "Senior" },
    { value: "expert", label: "Expert" },
  ],
} as const;

const SYNTHETIC_JOBS: NormalizedExternalJob[] = [
  {
    source: "nofluffjobs",
    sourceName: "NoFluffJobs",
    externalId: "NFJ-SYNTHETIC-1",
    title: "Senior Frontend Engineer",
    company: "Synthetic No Fluff Studio",
    location: "Warszawa",
    workMode: "hybrid",
    employmentType: "contract",
    salary: { min: 22_000, max: 28_000, currency: "PLN", unit: "month" },
    technologies: ["React", "TypeScript", "Next.js"],
    description: "Synthetic NoFluffJobs vacancy used only by isolated end-to-end tests.",
    postedAt: "2026-08-15T10:00:00.000Z",
    url: "https://nofluffjobs.com/pl/job/synthetic-senior-frontend-engineer",
  },
  {
    source: "nofluffjobs",
    sourceName: "NoFluffJobs",
    externalId: "NFJ-SYNTHETIC-2",
    title: "Junior JavaScript Developer",
    company: "Synthetic Product Works",
    location: "Remote",
    workMode: "remote",
    employmentType: "full_time",
    technologies: ["JavaScript", "HTML", "CSS"],
    description: "Synthetic NoFluffJobs discovery result.",
    postedAt: "2026-08-14T10:00:00.000Z",
    url: "https://nofluffjobs.com/pl/job/synthetic-junior-javascript-developer",
  },
];

function matchesSynthetic(job: NormalizedExternalJob, filters: JobSearchFilters): boolean {
  const keyword = filters.keywords.toLocaleLowerCase("en");
  const location = filters.location.toLocaleLowerCase("en");
  return (!keyword || [job.title, ...job.technologies].some((value) => value.toLocaleLowerCase("en").includes(keyword)))
    && (!location || job.location.toLocaleLowerCase("en").includes(location))
    && (filters.workModes.length === 0 || filters.workModes.includes(job.workMode))
    && (filters.technologies.length === 0 || filters.technologies.some((technology) =>
      job.technologies.some((value) => value.toLocaleLowerCase("en") === technology.toLocaleLowerCase("en"))));
}

function matchesWorkMode(job: NormalizedExternalJob, filters: JobSearchFilters): boolean {
  return filters.workModes.length === 0 || filters.workModes.includes(job.workMode);
}

export class NoFluffJobsAdapter implements JobSourceAdapter {
  readonly id = "nofluffjobs" as const;
  readonly name = "NoFluffJobs";
  readonly filterOptions = NO_FLUFF_FILTER_OPTIONS;

  async searchJobs(filters: JobSearchFilters): Promise<ExternalJobSearchResult> {
    if (isPlaywrightTestMode()) {
      const jobs = newestFirst(SYNTHETIC_JOBS.filter((job) => matchesSynthetic(job, filters)));
      return { jobs, sourceResultCount: jobs.length, sourceBatchLimit: 100, sourceHasMore: false };
    }

    const first = await fetchNoFluffSearchPage(filters, 1);
    const pageCount = noFluffPagesToFetch(first.totalPages);
    const postings = [...first.postings];
    for (let start = 2; start <= pageCount; start += PAGE_CONCURRENCY) {
      const pages = Array.from(
        { length: Math.min(PAGE_CONCURRENCY, pageCount - start + 1) },
        (_, index) => start + index,
      );
      const batch = await Promise.all(pages.map((page) => fetchNoFluffSearchPage(filters, page)));
      postings.push(...batch.flatMap((result) => result.postings));
    }
    const jobs = postings.flatMap((posting) => {
      const job = normalizeNoFluffPosting(posting);
      return job ? [job] : [];
    });
    return {
      jobs: newestFirst(mergeNoFluffJobs(jobs).filter((job) => matchesWorkMode(job, filters))),
      sourceResultCount: first.totalCount,
      sourceBatchLimit: pageCount * PAGE_SIZE,
      sourceHasMore: first.totalPages > MAX_NO_FLUFF_SEARCH_PAGES,
    };
  }

  async getJobDetails(job: Pick<NormalizedExternalJob, "externalId" | "url">): Promise<{ description: string }> {
    if (isPlaywrightTestMode()) {
      return {
        description: SYNTHETIC_JOBS.find((item) => item.externalId === job.externalId)?.description
          ?? "Synthetic NoFluffJobs discovery result.",
      };
    }
    const url = new URL(job.url);
    if (url.hostname !== "nofluffjobs.com" || !url.pathname.startsWith("/pl/job/")) {
      throw new Error("Invalid NoFluffJobs job URL.");
    }
    return { description: parseNoFluffJobDescription(await fetchNoFluffJobDetails(job.externalId)) };
  }
}
