import "server-only";

import { JustJoinAdapter } from "./justjoin/adapter";
import type { JobSourceAdapter, JobSourceId } from "./types";

const adapters = new Map<JobSourceId, JobSourceAdapter>([
  ["justjoinit", new JustJoinAdapter()],
]);

export const JOB_SOURCES = [...adapters.values()].map(({ id, name }) => ({ id, name }));

export function getJobSource(id: string): JobSourceAdapter | null {
  return adapters.get(id as JobSourceId) ?? null;
}
