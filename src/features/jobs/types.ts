export const JOB_STATUSES = [
  "new",
  "saved",
  "applied",
  "screening",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  new: "New",
  saved: "Saved",
  applied: "Applied",
  screening: "Screening",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export const WORK_MODES = ["remote", "hybrid", "onsite", "unspecified"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
  unspecified: "Not specified",
};

export const EMPLOYMENT_TYPES = [
  "full_time",
  "part_time",
  "contract",
  "internship",
  "temporary",
  "unspecified",
] as const;

export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
  temporary: "Temporary",
  unspecified: "Not specified",
};

export type Job = {
  id: string;
  title: string;
  company: string;
  status: JobStatus;
  source: string;
  sourceUrl: string;
  location: string;
  workMode: WorkMode;
  employmentType: EmploymentType;
  salary: string;
  description: string;
  technologies: string[];
  notes: string;
  discoveredOn: string;
  appliedOn: string;
  createdAt: string;
  updatedAt: string;
};

export type JobInput = Omit<Job, "id" | "createdAt" | "updatedAt">;

export type JobStatusHistory = {
  id: string;
  jobId: string;
  fromStatus: JobStatus | null;
  toStatus: JobStatus;
  changedAt: string;
};

export type JobQuery = {
  search?: string;
  status?: JobStatus;
  workMode?: WorkMode;
};

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: Record<string, string> };

export type ActionState = {
  status: "idle" | "success" | "error";
  message: string;
  errors?: Record<string, string>;
  values?: Record<string, string>;
};

export const INITIAL_ACTION_STATE: ActionState = {
  status: "idle",
  message: "",
};
