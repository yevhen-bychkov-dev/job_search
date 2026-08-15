import { JOB_STATUSES, type Job, type JobStatus, type JobStatusHistory } from "../jobs/types.ts";
import { monthInTimeZone } from "../jobs/domain.ts";

export type DashboardSummary = {
  metrics: {
    total: number;
    applied: number;
    active: number;
    interview: number;
    rejected: number;
    offers: number;
  };
  byStatus: Array<{ status: JobStatus; count: number }>;
  applicationsOverTime: Array<{ month: string; count: number }>;
  rejectionsOverTime: Array<{ month: string; count: number }>;
};

function countByMonth(
  values: string[],
  monthKey: (value: string) => string = (value) => /^\d{4}-\d{2}/.test(value) ? value.slice(0, 7) : "",
): Array<{ month: string; count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) {
    const month = monthKey(value);
    if (month) counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, count]) => ({ month, count }));
}

export function buildDashboardSummary(
  jobs: Job[],
  history: JobStatusHistory[],
): DashboardSummary {
  const statusCounts = new Map<JobStatus, number>(JOB_STATUSES.map((status) => [status, 0]));
  for (const job of jobs) statusCounts.set(job.status, (statusCounts.get(job.status) ?? 0) + 1);

  return {
    metrics: {
      total: jobs.length,
      applied: statusCounts.get("applied") ?? 0,
      active: jobs.filter((job) => ["applied", "screening", "interview"].includes(job.status)).length,
      interview: statusCounts.get("interview") ?? 0,
      rejected: statusCounts.get("rejected") ?? 0,
      offers: statusCounts.get("offer") ?? 0,
    },
    byStatus: JOB_STATUSES.map((status) => ({ status, count: statusCounts.get(status) ?? 0 })),
    applicationsOverTime: countByMonth(jobs.map((job) => job.appliedOn).filter(Boolean)),
    rejectionsOverTime: countByMonth(
      history.filter((event) => event.toStatus === "rejected").map((event) => event.changedAt),
      monthInTimeZone,
    ),
  };
}
