import "server-only";

import { JustJoinAdapter } from "./justjoin/adapter";
import { NoFluffJobsAdapter } from "./nofluffjobs/adapter";
import type { JobSourceAdapter, JobSourceId } from "./types";

const adapters = new Map<JobSourceId, JobSourceAdapter>([
  ["justjoinit", new JustJoinAdapter()],
  ["nofluffjobs", new NoFluffJobsAdapter()],
]);

export const JOB_SOURCES = [...adapters.values()].map(({ id, name, websiteUrl, filterOptions }) => ({
  id,
  name,
  websiteUrl,
  filterOptions,
}));

export function getJobSource(id: string): JobSourceAdapter | null {
  return adapters.get(id as JobSourceId) ?? null;
}
