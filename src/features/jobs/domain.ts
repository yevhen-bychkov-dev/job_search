import {
  EMPLOYMENT_TYPES,
  JOB_STATUSES,
  type EmploymentType,
  type Job,
  type JobInput,
  type JobStatus,
  type ValidationResult,
  type WorkMode,
  WORK_MODES,
} from "./types.ts";

const STATUS_ALIASES: Record<string, JobStatus> = {
  new: "new",
  saved: "saved",
  applied: "applied",
  screening: "screening",
  screen: "screening",
  interview: "interview",
  interviewing: "interview",
  offer: "offer",
  offered: "offer",
  rejected: "rejected",
  declined: "rejected",
  withdrawn: "withdrawn",
  closed: "withdrawn",
};

const WORK_MODE_ALIASES: Record<string, WorkMode> = {
  remote: "remote",
  hybrid: "hybrid",
  onsite: "onsite",
  "on-site": "onsite",
  office: "onsite",
  unspecified: "unspecified",
  "": "unspecified",
};

const EMPLOYMENT_ALIASES: Record<string, EmploymentType> = {
  "full-time": "full_time",
  "full time": "full_time",
  full_time: "full_time",
  "part-time": "part_time",
  "part time": "part_time",
  part_time: "part_time",
  contract: "contract",
  contractor: "contract",
  internship: "internship",
  intern: "internship",
  temporary: "temporary",
  temp: "temporary",
  unspecified: "unspecified",
  "": "unspecified",
};

function asTrimmedString(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function parseTechnologyList(value: unknown): string[] {
  const parts = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : typeof value === "string"
      ? value.split(/[;,|]/)
      : [];

  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of parts) {
    const technology = part.trim().slice(0, 60);
    const key = technology.toLocaleLowerCase("en");
    if (technology && !seen.has(key)) {
      seen.add(key);
      result.push(technology);
    }
    if (result.length === 50) break;
  }
  return result;
}

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function dateInTimeZone(
  instant = new Date(),
  timeZone = "Europe/Warsaw",
): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function monthInTimeZone(
  value: string,
  timeZone = "Europe/Warsaw",
): string {
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? "" : dateInTimeZone(instant, timeZone).slice(0, 7);
}

export function formatDateInTimeZone(
  value: string,
  timeZone = "Europe/Warsaw",
): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, dateStyle: "medium" }).format(
    new Date(value),
  );
}

export function formatDateTimeInTimeZone(
  value: string,
  timeZone = "Europe/Warsaw",
): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function parseJobStatus(value: unknown): JobStatus | null {
  if (typeof value !== "string") return null;
  return STATUS_ALIASES[value.trim().toLocaleLowerCase("en")] ?? null;
}

export function parseWorkMode(value: unknown): WorkMode | null {
  if (typeof value !== "string") return null;
  return WORK_MODE_ALIASES[value.trim().toLocaleLowerCase("en")] ?? null;
}

export function parseEmploymentType(value: unknown): EmploymentType | null {
  if (typeof value !== "string") return null;
  return EMPLOYMENT_ALIASES[value.trim().toLocaleLowerCase("en")] ?? null;
}

export function normalizeSourceUrl(value: string): string {
  if (!value.trim()) return "";
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (url.username || url.password) return "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      const lower = key.toLocaleLowerCase("en");
      if (lower.startsWith("utm_") || ["gclid", "fbclid", "ref"].includes(lower)) {
        url.searchParams.delete(key);
      }
    }
    url.hostname = url.hostname.toLocaleLowerCase("en");
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return "";
  }
}

function fingerprintPart(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function jobDuplicateKey(
  job: Pick<JobInput, "sourceUrl" | "company" | "title" | "location" | "externalSource" | "externalJobId">,
): string {
  if (job.externalSource && job.externalJobId) {
    return `external:${fingerprintPart(job.externalSource)}:${job.externalJobId.trim()}`;
  }
  const normalizedUrl = normalizeSourceUrl(job.sourceUrl);
  if (normalizedUrl) return `url:${normalizedUrl}`;
  return `fallback:${fingerprintPart(job.company)}|${fingerprintPart(job.title)}|${fingerprintPart(job.location)}`;
}

export function parseJobInput(
  input: Record<string, unknown>,
  options: { defaultDate?: string } = {},
): ValidationResult<JobInput> {
  const title = asTrimmedString(input.title, 200);
  const company = asTrimmedString(input.company, 200);
  const status = parseJobStatus(input.status ?? "new");
  const workMode = parseWorkMode(input.workMode ?? input.work_mode ?? "unspecified");
  const employmentType = parseEmploymentType(
    input.employmentType ?? input.employment_type ?? "unspecified",
  );
  const sourceUrl = asTrimmedString(input.sourceUrl ?? input.source_url, 2048);
  const discoveredOn = asTrimmedString(
    input.discoveredOn ?? input.discovered_on ?? options.defaultDate ?? dateInTimeZone(),
    10,
  );
  const appliedOn = asTrimmedString(input.appliedOn ?? input.applied_on, 10);
  const errors: Record<string, string> = {};

  if (title.length < 2) errors.title = "Enter a job title with at least 2 characters.";
  if (company.length < 2) errors.company = "Enter a company with at least 2 characters.";
  if (!status || !JOB_STATUSES.includes(status)) errors.status = "Choose a valid status.";
  if (!workMode || !WORK_MODES.includes(workMode)) errors.workMode = "Choose a valid work mode.";
  if (!employmentType || !EMPLOYMENT_TYPES.includes(employmentType)) {
    errors.employmentType = "Choose a valid employment type.";
  }
  if (sourceUrl && !normalizeSourceUrl(sourceUrl)) {
    errors.sourceUrl = "Enter a valid http or https URL.";
  }
  if (!isValidDateOnly(discoveredOn)) {
    errors.discoveredOn = "Enter a valid discovered date in YYYY-MM-DD format.";
  }
  if (appliedOn && !isValidDateOnly(appliedOn)) {
    errors.appliedOn = "Enter a valid applied date in YYYY-MM-DD format.";
  } else if (appliedOn && isValidDateOnly(discoveredOn) && appliedOn < discoveredOn) {
    errors.appliedOn = "Applied date cannot be earlier than the discovered date.";
  }
  if (Object.keys(errors).length > 0 || !status || !workMode || !employmentType) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      title,
      company,
      status,
      source: asTrimmedString(input.source, 120),
      sourceUrl: sourceUrl ? normalizeSourceUrl(sourceUrl) : "",
      externalSource: asTrimmedString(input.externalSource ?? input.external_source, 80),
      externalJobId: asTrimmedString(input.externalJobId ?? input.external_job_id, 200),
      location: asTrimmedString(input.location, 200),
      workMode,
      employmentType,
      salary: asTrimmedString(input.salary, 200),
      description: asTrimmedString(input.description, 30_000),
      technologies: parseTechnologyList(input.technologies),
      notes: asTrimmedString(input.notes, 20_000),
      discoveredOn,
      appliedOn,
    },
  };
}

export function formDataToRecord(formData: FormData): Record<string, string> {
  const limits = {
    title: 200,
    company: 200,
    status: 40,
    source: 120,
    sourceUrl: 2048,
    location: 200,
    workMode: 40,
    employmentType: 40,
    salary: 200,
    description: 30_000,
    technologies: 3000,
    notes: 20_000,
    discoveredOn: 10,
    appliedOn: 10,
    updatedAt: 40,
    id: 36,
    returnTo: 200,
  } as const;
  const record: Record<string, string> = {};
  for (const [key, limit] of Object.entries(limits)) {
    const value = formData.get(key);
    if (typeof value === "string") record[key] = value.slice(0, limit);
  }
  return record;
}

export function matchesJobQuery(job: Job, search: string): boolean {
  const needle = fingerprintPart(search);
  if (!needle) return true;
  return [job.title, job.company, job.location, job.source, ...job.technologies]
    .map(fingerprintPart)
    .some((value) => value.includes(needle));
}
