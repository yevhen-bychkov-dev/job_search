import "server-only";

import { DouAdapter } from "./dou/adapter";
import { JustJoinAdapter } from "./justjoin/adapter";
import { NoFluffJobsAdapter } from "./nofluffjobs/adapter";
import type { JobSourceAdapter, JobSourceId } from "./types";
import { WeWorkRemotelyAdapter } from "./weworkremotely/adapter";

const adapters = new Map<JobSourceId, JobSourceAdapter>([
  ["justjoinit", new JustJoinAdapter()],
  ["nofluffjobs", new NoFluffJobsAdapter()],
  ["dou", new DouAdapter()],
  ["weworkremotely", new WeWorkRemotelyAdapter()],
]);

export const JOB_SOURCES = [...adapters.values()].map(({ id, name, websiteUrl, supportedWorkModes, filterOptions }) => ({
  id,
  name,
  websiteUrl,
  supportedWorkModes,
  filterOptions,
}));

export function getJobSource(id: string): JobSourceAdapter | null {
  return adapters.get(id as JobSourceId) ?? null;
}
