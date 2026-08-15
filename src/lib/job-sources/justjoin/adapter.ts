import "server-only";

import { newestFirst } from "@/features/job-discovery/domain";
import { isPlaywrightTestMode } from "@/lib/supabase/environment";
import type {
  ExternalJobSearchResult,
  JobSearchFilters,
  JobSourceAdapter,
  NormalizedExternalJob,
} from "../types";
import { fetchJustJoinHtml } from "./client";
import { normalizeJustJoinOffer } from "./normalize";
import { parseJustJoinDescriptionHtml, parseJustJoinSearchHtml } from "./parse";

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

export function buildJustJoinSearchUrl(filters: JobSearchFilters): URL {
  const location = locationSlug(filters.location) || "all-locations";
  const url = new URL(`https://justjoin.it/job-offers/${encodeURIComponent(location)}`);
  if (filters.keywords) url.searchParams.set("keyword", filters.keywords);
  if (filters.workModes.length > 0) {
    url.searchParams.set(
      "remote-work-options",
      filters.workModes.map((mode) => mode === "onsite" ? "office" : mode).join(","),
    );
  }
  url.searchParams.set("sortBy", "published");
  return url;
}

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

  async searchJobs(filters: JobSearchFilters): Promise<ExternalJobSearchResult> {
    if (isPlaywrightTestMode()) {
      const keyword = filters.keywords.toLocaleLowerCase("en");
      const jobs = SYNTHETIC_JOBS.filter((job) => !keyword || [job.title, ...job.technologies]
        .some((value) => value.toLocaleLowerCase("en").includes(keyword)))
        .filter((job) => !filters.location || job.location.toLocaleLowerCase("en").includes(filters.location.toLocaleLowerCase("en")))
        .filter((job) => filters.workModes.length === 0 || filters.workModes.includes(job.workMode));
      return { jobs: newestFirst(jobs), sourceResultCount: jobs.length, sourceBatchLimit: 100, sourceHasMore: false };
    }
    const parsed = parseJustJoinSearchHtml(await fetchJustJoinHtml(buildJustJoinSearchUrl(filters)));
    const jobs = newestFirst(parsed.offers.flatMap((offer) => {
      const normalized = normalizeJustJoinOffer(offer);
      return normalized ? [normalized] : [];
    }));
    return {
      jobs,
      sourceResultCount: parsed.totalItems,
      sourceBatchLimit: parsed.batchSize,
      sourceHasMore: parsed.hasMore,
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
