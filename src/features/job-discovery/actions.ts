"use server";

import { revalidatePath } from "next/cache";

import { requireIdentity } from "@/features/auth/session";
import { DuplicateJobError } from "@/lib/data/contracts";
import { getAppStore } from "@/lib/data/server-store";
import { getJobSource } from "@/lib/job-sources/registry";
import type { NormalizedExternalJob } from "@/lib/job-sources/types";
import { reportUnexpectedError } from "@/lib/server-errors";

import {
  externalJobToJobInput,
  filterKnownExternalJobs,
  isValidExternalIdentity,
  newestFirst,
  parseDiscoveryFilters,
  parseExternalJob,
} from "./domain";

export type DiscoverySearchState =
  | { status: "success"; jobs: NormalizedExternalJob[]; sourceResultCount: number; sourceBatchLimit: number; sourceHasMore: boolean }
  | { status: "error"; message: string };

export async function searchExternalJobsAction(sourceId: string, rawFilters: unknown): Promise<DiscoverySearchState> {
  const identity = await requireIdentity();
  const source = getJobSource(sourceId);
  const filters = parseDiscoveryFilters(rawFilters);
  if (!source || !filters) return { status: "error", message: "Choose valid search filters and try again." };
  try {
    const [result, known] = await Promise.all([
      source.searchJobs(filters),
      getAppStore().listExternalJobIds(identity.userId, source.id),
    ]);
    return {
      status: "success",
      jobs: newestFirst(filterKnownExternalJobs(result.jobs, known)),
      sourceResultCount: result.sourceResultCount,
      sourceBatchLimit: result.sourceBatchLimit,
      sourceHasMore: result.sourceHasMore,
    };
  } catch (error) {
    reportUnexpectedError("job-discovery.search", error);
    return { status: "error", message: "JustJoinIT could not be reached or its response changed. Try again shortly." };
  }
}

export async function loadExternalJobDetailsAction(rawJob: unknown): Promise<
  { status: "success"; description: string } | { status: "error"; message: string }
> {
  await requireIdentity();
  const job = parseExternalJob(rawJob);
  const source = job ? getJobSource(job.source) : null;
  if (!job || !source) return { status: "error", message: "This vacancy has an invalid source link." };
  try {
    const details = await source.getJobDetails(job);
    return { status: "success", description: details.description };
  } catch (error) {
    reportUnexpectedError("job-discovery.details", error);
    return { status: "error", message: "The full description is temporarily unavailable. You can still open the source vacancy." };
  }
}

export async function addExternalJobsAction(rawJobs: unknown): Promise<
  { status: "success"; message: string; processedExternalIds: string[] }
  | { status: "error"; message: string }
> {
  const identity = await requireIdentity();
  if (!Array.isArray(rawJobs) || rawJobs.length === 0 || rawJobs.length > 50) {
    return { status: "error", message: "Select between 1 and 50 vacancies." };
  }
  const jobs = rawJobs.map(parseExternalJob);
  if (jobs.some((job) => !job)) return { status: "error", message: "One or more vacancies are invalid. Search again and retry." };
  const validJobs = jobs as NormalizedExternalJob[];
  try {
    const result = await getAppStore().importJobs(identity.userId, validJobs.map(externalJobToJobInput));
    revalidatePath("/dashboard");
    revalidatePath("/jobs");
    revalidatePath("/board");
    revalidatePath("/jobs/discover");
    return {
      status: "success",
      message: result.duplicates > 0
        ? `Added ${result.imported}; ${result.duplicates} already saved.`
        : `Added ${result.imported} ${result.imported === 1 ? "job" : "jobs"}.`,
      processedExternalIds: validJobs.map((job) => job.externalId),
    };
  } catch (error) {
    if (!(error instanceof DuplicateJobError)) reportUnexpectedError("job-discovery.add", error);
    return { status: "error", message: "The selected jobs could not be added. Try again." };
  }
}

export async function ignoreExternalJobAction(source: unknown, externalId: unknown): Promise<
  { status: "success"; message: string } | { status: "error"; message: string }
> {
  const identity = await requireIdentity();
  if (!isValidExternalIdentity(source, externalId) || !getJobSource(String(source))) {
    return { status: "error", message: "This vacancy has an invalid identity." };
  }
  try {
    await getAppStore().ignoreExternalJob(identity.userId, String(source), String(externalId));
    revalidatePath("/jobs/discover");
    return { status: "success", message: "Vacancy hidden. It will not appear in future searches." };
  } catch (error) {
    reportUnexpectedError("job-discovery.ignore", error);
    return { status: "error", message: "The vacancy could not be hidden. Try again." };
  }
}
