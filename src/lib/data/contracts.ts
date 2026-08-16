import type { FilterSettings } from "@/features/filters/types";
import type { GeneratedCv, GeneratedCvContent } from "@/features/cvs/types";
import type { Job, JobInput, JobQuery, JobStatus, JobStatusHistory } from "@/features/jobs/types";
import type { CandidateProfile } from "@/features/knowledge/candidate-profile";
import type { KnowledgeDocumentKind, KnowledgeFile } from "@/features/knowledge/types";

export class DuplicateJobError extends Error {
  constructor() {
    super("This job appears to already exist.");
    this.name = "DuplicateJobError";
  }
}

export class ResourceNotFoundError extends Error {
  constructor(resource = "Resource") {
    super(`${resource} was not found.`);
    this.name = "ResourceNotFoundError";
  }
}

export class DataConsistencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataConsistencyError";
  }
}

export class ConcurrentModificationError extends Error {
  constructor() {
    super("This job changed in another tab. Reload the page before saving again.");
    this.name = "ConcurrentModificationError";
  }
}

export type StoredKnowledgeDownload =
  | { kind: "redirect"; url: string }
  | { kind: "content"; bytes: Uint8Array; mimeType: string; filename: string };

export type StoredCvDownload = StoredKnowledgeDownload;

export interface AppStore {
  listJobs(userId: string, query?: JobQuery): Promise<Job[]>;
  getJob(userId: string, id: string): Promise<Job | null>;
  createJob(userId: string, input: JobInput): Promise<Job>;
  importJobs(
    userId: string,
    inputs: JobInput[],
  ): Promise<{ imported: number; duplicates: number }>;
  listExternalJobIds(
    userId: string,
    source: string,
  ): Promise<{ saved: string[]; ignored: string[]; savedUrls: string[] }>;
  ignoreExternalJob(userId: string, source: string, externalJobId: string): Promise<void>;
  updateJob(
    userId: string,
    id: string,
    input: JobInput,
    expectedUpdatedAt: string,
  ): Promise<Job>;
  updateJobStatus(userId: string, id: string, status: JobStatus, appliedOn: string): Promise<Job>;
  deleteJob(userId: string, id: string): Promise<void>;
  listStatusHistory(userId: string, jobId?: string): Promise<JobStatusHistory[]>;
  getFilters(userId: string): Promise<FilterSettings>;
  saveFilters(userId: string, filters: FilterSettings): Promise<FilterSettings>;
  listKnowledgeFiles(userId: string): Promise<KnowledgeFile[]>;
  uploadKnowledgeFile(
    userId: string,
    file: { filename: string; mimeType: string; documentKind: KnowledgeDocumentKind; bytes: Uint8Array },
  ): Promise<KnowledgeFile>;
  downloadKnowledgeFile(userId: string, id: string): Promise<StoredKnowledgeDownload>;
  deleteKnowledgeFile(userId: string, id: string): Promise<void>;
  getCandidateProfile(userId: string): Promise<CandidateProfile | null>;
  listGeneratedCvs(userId: string, jobId: string): Promise<GeneratedCv[]>;
  createGeneratedCv(
    userId: string,
    jobId: string,
    input: { bytes: Uint8Array; content: GeneratedCvContent; aiProvider: string; aiModel: string },
  ): Promise<GeneratedCv>;
  downloadGeneratedCv(
    userId: string,
    jobId: string,
    id: string,
    download: boolean,
  ): Promise<StoredCvDownload>;
  resetForTests(): Promise<void>;
}
