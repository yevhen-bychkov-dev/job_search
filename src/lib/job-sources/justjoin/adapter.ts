import "server-only";

import { newestFirst } from "@/features/job-discovery/domain";
import { isPlaywrightTestMode } from "@/lib/supabase/environment";
import type {
  ExternalJobSearchResult,
  JobSearchFilters,
  JobSourceAdapter,
  NormalizedExternalJob,
} from "../types";
import { fetchJustJoinHtml, fetchJustJoinSearchPage } from "./client";
import { normalizeJustJoinOffer } from "./normalize";
import { parseJustJoinDescriptionHtml, parseJustJoinSearchResponse } from "./parse";
import {
  buildJustJoinSearchUrl,
  JUST_JOIN_PAGE_SIZE,
  justJoinPagesToFetch,
} from "./search";

const PAGE_CONCURRENCY = 3;

export const JUST_JOIN_FILTER_OPTIONS = {
  categories: [
    { value: "javascript", label: "JavaScript" },
    { value: "html", label: "HTML" },
    { value: "python", label: "Python" },
    { value: "java", label: "Java" },
    { value: "net", label: ".NET" },
    { value: "mobile", label: "Mobile" },
    { value: "testing", label: "Testing" },
    { value: "devops", label: "DevOps" },
    { value: "data", label: "Data" },
    { value: "security", label: "Security" },
    { value: "architecture", label: "Architecture" },
    { value: "other", label: "Other" },
  ],
  technologies: [],
  seniorities: [
    { value: "intern", label: "Intern" },
    { value: "junior", label: "Junior" },
    { value: "mid", label: "Mid" },
    { value: "senior", label: "Senior" },
    { value: "lead", label: "Team leader / manager" },
    { value: "c-level", label: "C-level" },
  ],
} as const;

const SYNTHETIC_JOBS: NormalizedExternalJob[] = [
  {
    source: "justjoinit", sourceName: "JustJoinIT", externalId: "11111111-aaaa-4111-8111-111111111111",
    title: "Frontend Platform Engineer", company: "Synthetic Discovery Labs", location: "Warszawa",
    workMode: "remote", employmentType: "full_time", salary: { min: 18000, max: 24000, currency: "PLN", unit: "month" },
    technologies: ["React", "TypeScript", "Next.js"], description: "Synthetic vacancy used only by isolated end-to-end tests.",
    postedAt: "2026-08-15T12:00:00.000Z", url: "https://justjoin.it/job-offer/synthetic-frontend-platform-engineer",
  },
  {
    source: "justjoinit", sourceName: "JustJoinIT", externalId: "22222222-bbbb-4222-8222-222222222222",
    title: "Software Engineer", company: "Synthetic Product Studio", location: "Kraków",
    workMode: "hybrid", employmentType: "contract", technologies: ["JavaScript", "Node.js"], description: "Synthetic discovery result.",
    postedAt: "2026-08-14T12:00:00.000Z", url: "https://justjoin.it/job-offer/synthetic-software-engineer",
  },
  {
    source: "justjoinit", sourceName: "JustJoinIT", externalId: "33333333-cccc-4333-8333-333333333333",
    title: "UI Engineer", company: "Synthetic Interface Co", location: "Gdańsk",
    workMode: "onsite", employmentType: "full_time", technologies: ["React", "CSS"], description: "Synthetic discovery result.",
    postedAt: "2026-08-13T12:00:00.000Z", url: "https://justjoin.it/job-offer/synthetic-ui-engineer",
  },
];

export class JustJoinAdapter implements JobSourceAdapter {
  readonly id = "justjoinit" as const;
  readonly name = "JustJoinIT";
  readonly websiteUrl = "https://justjoin.it/job-offers";
  readonly supportedWorkModes = ["remote", "hybrid", "onsite"] as const;
  readonly filterOptions = JUST_JOIN_FILTER_OPTIONS;

  async searchJobs(filters: JobSearchFilters): Promise<ExternalJobSearchResult> {
    if (isPlaywrightTestMode()) {
      const keyword = filters.keywords.toLocaleLowerCase("en");
      const jobs = SYNTHETIC_JOBS.filter((job) => !keyword || [job.title, ...job.technologies]
        .some((value) => value.toLocaleLowerCase("en").includes(keyword)))
        .filter((job) => !filters.location || job.location.toLocaleLowerCase("en").includes(filters.location.toLocaleLowerCase("en")))
        .filter((job) => filters.workModes.length === 0 || filters.workModes.includes(job.workMode));
      return { jobs: newestFirst(jobs), sourceResultCount: jobs.length, sourceBatchLimit: 100, sourceHasMore: false };
    }
    const first = parseJustJoinSearchResponse(await fetchJustJoinSearchPage(buildJustJoinSearchUrl(filters)));
    const pageCount = justJoinPagesToFetch(first.totalItems);
    const offers = [...first.offers];
    for (let page = 1; page < pageCount; page += PAGE_CONCURRENCY) {
      const pages = Array.from(
        { length: Math.min(PAGE_CONCURRENCY, pageCount - page) },
        (_, index) => page + index,
      );
      const batch = await Promise.all(pages.map(async (pageIndex) => (
        parseJustJoinSearchResponse(
          await fetchJustJoinSearchPage(buildJustJoinSearchUrl(filters, pageIndex * JUST_JOIN_PAGE_SIZE)),
        )
      )));
      offers.push(...batch.flatMap((result) => result.offers));
    }
    const jobs = newestFirst(offers.flatMap((offer) => {
      const normalized = normalizeJustJoinOffer(offer);
      return normalized ? [normalized] : [];
    }));
    return {
      jobs,
      sourceResultCount: first.totalItems,
      sourceBatchLimit: pageCount * JUST_JOIN_PAGE_SIZE,
      sourceHasMore: first.totalItems > pageCount * JUST_JOIN_PAGE_SIZE,
    };
  }

  async getJobDetails(job: Pick<NormalizedExternalJob, "externalId" | "url">): Promise<{ description: string }> {
    if (isPlaywrightTestMode()) {
      return { description: SYNTHETIC_JOBS.find((item) => item.externalId === job.externalId)?.description ?? "Synthetic discovery result." };
    }
    const url = new URL(job.url);
    if (!url.pathname.startsWith("/job-offer/")) throw new Error("Invalid JustJoinIT job URL.");
    return { description: parseJustJoinDescriptionHtml(await fetchJustJoinHtml(url)) };
  }
}
