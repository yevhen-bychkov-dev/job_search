import assert from "node:assert/strict";
import test from "node:test";

import { buildDashboardSummary } from "../../src/features/dashboard/domain.ts";
import { jobMatchesFilters, parseFilterSettings } from "../../src/features/filters/domain.ts";
import type { Job, JobInput, JobStatusHistory } from "../../src/features/jobs/types.ts";

const jobInput: JobInput = {
  title: "Frontend Engineer",
  company: "Synthetic Labs",
  status: "interview",
  source: "",
  sourceUrl: "",
  location: "Remote",
  workMode: "remote",
  employmentType: "full_time",
  salary: "",
  description: "React and TypeScript platform",
  technologies: ["React", "TypeScript"],
  notes: "",
  discoveredOn: "2026-07-01",
  appliedOn: "2026-07-04",
};

test("filter settings reject overlap and evaluate include/exclude/title rules", () => {
  const overlap = parseFilterSettings({ includedTechnologies: "React", excludedTechnologies: "react", preferredTitles: "" });
  assert.equal(overlap.ok, false);
  const parsed = parseFilterSettings({ includedTechnologies: "React, TypeScript", excludedTechnologies: "PHP", preferredTitles: "Frontend" }, "2026-08-15T00:00:00Z");
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(jobMatchesFilters(jobInput, parsed.data), true);
  assert.equal(jobMatchesFilters({ ...jobInput, description: "PHP", technologies: ["PHP"] }, parsed.data), false);
});

test("dashboard derives current metrics and historical trends from stored records", () => {
  const jobs: Job[] = [
    { id: "1", ...jobInput, createdAt: "2026-07-01T00:00:00Z", updatedAt: "2026-07-04T00:00:00Z" },
    { id: "2", ...jobInput, status: "rejected", appliedOn: "2026-08-01", createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-02T00:00:00Z" },
    { id: "3", ...jobInput, status: "offer", appliedOn: "", createdAt: "2026-08-03T00:00:00Z", updatedAt: "2026-08-03T00:00:00Z" },
  ];
  const history: JobStatusHistory[] = [
    { id: "h1", jobId: "2", fromStatus: "interview", toStatus: "rejected", changedAt: "2026-08-02T10:00:00Z" },
  ];
  const summary = buildDashboardSummary(jobs, history);
  assert.deepEqual(summary.metrics, { total: 3, applied: 0, active: 1, interview: 1, rejected: 1, offers: 1 });
  assert.deepEqual(summary.applicationsOverTime, [{ month: "2026-07", count: 1 }, { month: "2026-08", count: 1 }]);
  assert.deepEqual(summary.rejectionsOverTime, [{ month: "2026-08", count: 1 }]);
});
