import type { FilterSettings } from "@/features/filters/types";
import type { ApprovedResumeSkill, CvFitAssessmentContent, GeneratedCv, GeneratedCvContent, JobResumeRequirements, ResumeAiStage, ResumeConfirmation, ResumeGeneration, ResumeGenerationStatus, SavedJobRequirement, VacancyAnalysis } from "@/features/cvs/types";
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

export class DatabaseMigrationRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseMigrationRequiredError";
  }
}

export class ConcurrentModificationError extends Error {
  constructor() {
    super("This job changed in another tab. Reload the page before saving again.");
    this.name = "ConcurrentModificationError";
  }
}

export class ArtifactPersistenceError extends Error {
  readonly stage: "upload" | "metadata" | "cleanup";

  constructor(stage: "upload" | "metadata" | "cleanup", message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ArtifactPersistenceError";
    this.stage = stage;
  }
}

export type StoredKnowledgeDownload =
  | { kind: "redirect"; url: string }
  | { kind: "content"; bytes: Uint8Array; mimeType: string; filename: string };

export type StoredCvDownload = StoredKnowledgeDownload;

export type ResumeTemplate = {
  id: string;
  originalName: string;
  sizeBytes: number;
  version: number;
  active: boolean;
  createdAt: string;
};

export type StoredResumeTemplate = { bytes: Uint8Array; mimeType: string; filename: string; version: number };

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
  listResumeTemplates(userId: string): Promise<ResumeTemplate[]>;
  getActiveResumeTemplate(userId: string): Promise<ResumeTemplate | null>;
  uploadResumeTemplate(userId: string, file: { filename: string; mimeType: string; bytes: Uint8Array }): Promise<ResumeTemplate>;
  downloadResumeTemplate(userId: string, id: string): Promise<StoredResumeTemplate>;
  listResumeConfirmations(userId: string): Promise<ResumeConfirmation[]>;
  saveResumeConfirmation(userId: string, confirmation: ResumeConfirmation): Promise<ResumeConfirmation>;
  getJobResumeRequirements(userId: string, jobId: string): Promise<JobResumeRequirements | null>;
  saveJobResumeRequirements(userId: string, jobId: string, input: { analysis: VacancyAnalysis; requirements: SavedJobRequirement[]; approvedAt: string | null }): Promise<JobResumeRequirements>;
  createResumeGeneration(userId: string, jobId: string, idempotencyKey: string): Promise<ResumeGeneration>;
  getResumeGeneration(userId: string, id: string): Promise<ResumeGeneration | null>;
  getLatestResumeGeneration(userId: string, jobId: string): Promise<ResumeGeneration | null>;
  claimResumeGeneration(userId: string, id: string, input: { expectedUpdatedAt: string; status: "generating" | "rendering"; currentStage: ResumeAiStage; leaseExpiresAt: string; analysis?: VacancyAnalysis; approvedSkills?: ApprovedResumeSkill[]; templateVersion?: number }): Promise<ResumeGeneration | null>;
  updateResumeGeneration(userId: string, id: string, input: { status: ResumeGenerationStatus; analysis?: VacancyAnalysis | null; approvedSkills?: ApprovedResumeSkill[]; generatedContent?: GeneratedCvContent | null; currentStage?: ResumeAiStage | null; attemptCount?: number; nextRetryAt?: string | null; leaseExpiresAt?: string | null; errorCode?: string | null; templateVersion?: number | null; aiProvider?: string | null; aiModel?: string | null }): Promise<ResumeGeneration>;
  listGeneratedCvs(userId: string, jobId: string): Promise<GeneratedCv[]>;
  getGeneratedCv(userId: string, jobId: string, id: string): Promise<GeneratedCv | null>;
  createGeneratedCv(
    userId: string,
    jobId: string,
    input: { bytes: Uint8Array; content: GeneratedCvContent; aiProvider: string; aiModel: string; generationId?: string | null; templateVersion?: number | null },
  ): Promise<GeneratedCv>;
  downloadGeneratedCv(
    userId: string,
    jobId: string,
    id: string,
    download: boolean,
  ): Promise<StoredCvDownload>;
  saveGeneratedCvAssessment(
    userId: string,
    jobId: string,
    id: string,
    input: { assessment: CvFitAssessmentContent; sourceUrl: string; aiProvider: string; aiModel: string },
  ): Promise<GeneratedCv>;
  deleteGeneratedCv(userId: string, jobId: string, id: string): Promise<void>;
  resetForTests(): Promise<void>;
}
