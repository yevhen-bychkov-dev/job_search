import type { EmploymentType, WorkMode } from "@/features/jobs/types";

export type JobSourceId = "justjoinit";

export type JobSearchFilters = {
  keywords: string;
  location: string;
  workModes: WorkMode[];
};

export type ExternalSalary = {
  min?: number;
  max?: number;
  currency: string;
  unit?: string;
};

export type NormalizedExternalJob = {
  source: JobSourceId;
  sourceName: string;
  externalId: string;
  title: string;
  company: string;
  location: string;
  workMode: WorkMode;
  employmentType: EmploymentType;
  salary?: ExternalSalary;
  technologies: string[];
  description: string;
  postedAt?: string;
  url: string;
};

export type ExternalJobSearchResult = {
  jobs: NormalizedExternalJob[];
  sourceResultCount: number;
  sourceBatchLimit: number;
  sourceHasMore: boolean;
};

export interface JobSourceAdapter {
  readonly id: JobSourceId;
  readonly name: string;
  searchJobs(filters: JobSearchFilters): Promise<ExternalJobSearchResult>;
  getJobDetails(job: Pick<NormalizedExternalJob, "externalId" | "url">): Promise<{ description: string }>;
}
