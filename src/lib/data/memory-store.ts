import "server-only";

import { createDefaultFilterSettings } from "@/features/filters/domain";
import type { FilterSettings } from "@/features/filters/types";
import { nextCvVersion } from "@/features/cvs/domain";
import type { GeneratedCv, JobResumeRequirements, ResumeConfirmation, ResumeGeneration, SavedJobRequirement, VacancyAnalysis } from "@/features/cvs/types";
import { jobDuplicateKey, matchesJobQuery } from "@/features/jobs/domain";
import type { Job, JobInput, JobQuery, JobStatus, JobStatusHistory } from "@/features/jobs/types";
import { parseCandidateProfileBytes, type CandidateProfile } from "@/features/knowledge/candidate-profile";
import type { KnowledgeFile } from "@/features/knowledge/types";

import {
  type AppStore,
  ConcurrentModificationError,
  DuplicateJobError,
  ResourceNotFoundError,
  type ResumeTemplate,
  type StoredKnowledgeDownload,
  type StoredResumeTemplate,
} from "./contracts";

type StoredKnowledgeFile = KnowledgeFile & {
  userId: string;
  bytes: Uint8Array;
};

type StoredGeneratedCv = GeneratedCv & {
  userId: string;
  bytes: Uint8Array;
};

type StoredTemplate = ResumeTemplate & { userId: string; mimeType: string; bytes: Uint8Array };
type StoredGeneration = ResumeGeneration & { userId: string };
type StoredJobResumeRequirements = JobResumeRequirements & { userId: string; jobId: string };

type MemoryState = {
  jobs: Array<Job & { userId: string; duplicateKey: string }>;
  history: Array<JobStatusHistory & { userId: string }>;
  filters: Map<string, FilterSettings>;
  files: StoredKnowledgeFile[];
  generatedCvs: StoredGeneratedCv[];
  templates: StoredTemplate[];
  generations: StoredGeneration[];
  confirmations: Array<ResumeConfirmation & { userId: string }>;
  jobRequirements: StoredJobResumeRequirements[];
  ignoredExternalJobs: Array<{ userId: string; source: string; externalJobId: string }>;
};

declare global {
  var jobSearchTestState: MemoryState | undefined;
}

function initialState(): MemoryState {
  return { jobs: [], history: [], filters: new Map(), files: [], generatedCvs: [], templates: [], generations: [], confirmations: [], jobRequirements: [], ignoredExternalJobs: [] };
}

function state(): MemoryState {
  globalThis.jobSearchTestState ??= initialState();
  return globalThis.jobSearchTestState;
}

function createJobRecord(userId: string, input: JobInput): Job & { userId: string; duplicateKey: string } {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    ...input,
    externalSource: input.externalSource ?? "",
    externalJobId: input.externalJobId ?? "",
    userId,
    duplicateKey: jobDuplicateKey(input),
    createdAt: now,
    updatedAt: now,
  };
}

function publicJob(record: Job & { userId: string; duplicateKey: string }): Job {
  return {
    id: record.id,
    title: record.title,
    company: record.company,
    status: record.status,
    source: record.source,
    sourceUrl: record.sourceUrl,
    externalSource: record.externalSource,
    externalJobId: record.externalJobId,
    location: record.location,
    workMode: record.workMode,
    employmentType: record.employmentType,
    salary: record.salary,
    description: record.description,
    technologies: [...record.technologies],
    notes: record.notes,
    discoveredOn: record.discoveredOn,
    appliedOn: record.appliedOn,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function publicFile(record: StoredKnowledgeFile): KnowledgeFile {
  return {
    id: record.id,
    originalName: record.originalName,
    mimeType: record.mimeType,
    documentKind: record.documentKind,
    sizeBytes: record.sizeBytes,
    createdAt: record.createdAt,
  };
}

function publicGeneratedCv(record: StoredGeneratedCv): GeneratedCv {
  return {
    id: record.id,
    jobId: record.jobId,
    version: record.version,
    content: structuredClone(record.content),
    aiProvider: record.aiProvider,
    aiModel: record.aiModel,
    generationId: record.generationId,
    templateVersion: record.templateVersion,
    createdAt: record.createdAt,
  };
}

function publicTemplate(record: StoredTemplate): ResumeTemplate {
  return { id: record.id, originalName: record.originalName, sizeBytes: record.sizeBytes, version: record.version, active: record.active, createdAt: record.createdAt };
}

function publicGeneration(record: StoredGeneration): ResumeGeneration {
  return { id: record.id, jobId: record.jobId, status: record.status, idempotencyKey: record.idempotencyKey, analysis: structuredClone(record.analysis), confirmations: structuredClone(record.confirmations), strategy: structuredClone(record.strategy), generatedContent: structuredClone(record.generatedContent), critique: structuredClone(record.critique), correction: structuredClone(record.correction), currentStage: record.currentStage, attemptCount: record.attemptCount, nextRetryAt: record.nextRetryAt, errorCode: record.errorCode, templateVersion: record.templateVersion, createdAt: record.createdAt, updatedAt: record.updatedAt };
}

export class MemoryAppStore implements AppStore {
  async listJobs(userId: string, query: JobQuery = {}): Promise<Job[]> {
    return state()
      .jobs.filter((job) => job.userId === userId)
      .filter((job) => !query.status || job.status === query.status)
      .filter((job) => !query.workMode || job.workMode === query.workMode)
      .filter((job) => matchesJobQuery(job, query.search ?? ""))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(publicJob);
  }

  async getJob(userId: string, id: string): Promise<Job | null> {
    const found = state().jobs.find((job) => job.userId === userId && job.id === id);
    if (!found) return null;
    return publicJob(found);
  }

  async createJob(userId: string, input: JobInput): Promise<Job> {
    const duplicateKey = jobDuplicateKey(input);
    if (state().jobs.some((job) => job.userId === userId && job.duplicateKey === duplicateKey)) {
      throw new DuplicateJobError();
    }
    const stored = createJobRecord(userId, input);
    state().jobs.push(stored);
    state().history.push({
      id: crypto.randomUUID(),
      jobId: stored.id,
      userId,
      fromStatus: null,
      toStatus: stored.status,
      changedAt: stored.createdAt,
    });
    return publicJob(stored);
  }

  async importJobs(
    userId: string,
    inputs: JobInput[],
  ): Promise<{ imported: number; duplicates: number }> {
    const existingKeys = new Set(
      state().jobs.filter((job) => job.userId === userId).map((job) => job.duplicateKey),
    );
    const staged: Array<Job & { userId: string; duplicateKey: string }> = [];
    let duplicates = 0;
    for (const input of inputs) {
      const duplicateKey = jobDuplicateKey(input);
      if (existingKeys.has(duplicateKey)) {
        duplicates += 1;
        continue;
      }
      existingKeys.add(duplicateKey);
      staged.push(createJobRecord(userId, input));
    }

    const history = staged.map((job) => ({
      id: crypto.randomUUID(),
      jobId: job.id,
      userId,
      fromStatus: null,
      toStatus: job.status,
      changedAt: job.createdAt,
    }));
    state().jobs.push(...staged);
    state().history.push(...history);
    return { imported: staged.length, duplicates };
  }

  async listExternalJobIds(
    userId: string,
    source: string,
  ): Promise<{ saved: string[]; ignored: string[]; savedUrls: string[] }> {
    return {
      saved: state().jobs
        .filter((job) => job.userId === userId && job.externalSource === source && job.externalJobId)
        .flatMap((job) => job.externalJobId ? [job.externalJobId] : []),
      savedUrls: state().jobs
        .filter((job) => job.userId === userId && (!job.externalSource || job.externalSource === source))
        .flatMap((job) => job.sourceUrl ? [job.sourceUrl] : []),
      ignored: state().ignoredExternalJobs
        .filter((job) => job.userId === userId && job.source === source)
        .map((job) => job.externalJobId),
    };
  }

  async ignoreExternalJob(userId: string, source: string, externalJobId: string): Promise<void> {
    if (!state().ignoredExternalJobs.some((job) =>
      job.userId === userId && job.source === source && job.externalJobId === externalJobId
    )) {
      state().ignoredExternalJobs.push({ userId, source, externalJobId });
    }
  }

  async updateJob(
    userId: string,
    id: string,
    input: JobInput,
    expectedUpdatedAt: string,
  ): Promise<Job> {
    const current = state().jobs.find((job) => job.userId === userId && job.id === id);
    if (!current) throw new ResourceNotFoundError("Job");
    if (current.updatedAt !== expectedUpdatedAt) throw new ConcurrentModificationError();
    const identityInput: JobInput = {
      ...input,
      externalSource: current.externalSource,
      externalJobId: current.externalJobId,
    };
    const duplicateKey = jobDuplicateKey(identityInput);
    if (
      state().jobs.some(
        (job) => job.userId === userId && job.id !== id && job.duplicateKey === duplicateKey,
      )
    ) {
      throw new DuplicateJobError();
    }
    const priorStatus = current.status;
    const nextUpdatedAt = new Date(
      Math.max(Date.now(), new Date(current.updatedAt).getTime() + 1),
    ).toISOString();
    Object.assign(current, identityInput, { duplicateKey, updatedAt: nextUpdatedAt });
    if (priorStatus !== current.status) {
      state().history.push({
        id: crypto.randomUUID(),
        jobId: current.id,
        userId,
        fromStatus: priorStatus,
        toStatus: current.status,
        changedAt: current.updatedAt,
      });
    }
    return publicJob(current);
  }

  async updateJobStatus(
    userId: string,
    id: string,
    status: JobStatus,
    appliedOn: string,
  ): Promise<Job> {
    const current = state().jobs.find((job) => job.userId === userId && job.id === id);
    if (!current) throw new ResourceNotFoundError("Job");
    if (current.status !== status) {
      const fromStatus = current.status;
      current.status = status;
      if (!current.appliedOn && status === "applied") current.appliedOn = appliedOn;
      current.updatedAt = new Date(
        Math.max(Date.now(), new Date(current.updatedAt).getTime() + 1),
      ).toISOString();
      state().history.push({
        id: crypto.randomUUID(),
        jobId: id,
        userId,
        fromStatus,
        toStatus: status,
        changedAt: current.updatedAt,
      });
    } else if (status === "applied" && !current.appliedOn) {
      current.appliedOn = appliedOn;
      current.updatedAt = new Date(
        Math.max(Date.now(), new Date(current.updatedAt).getTime() + 1),
      ).toISOString();
    }
    return publicJob(current);
  }

  async deleteJob(userId: string, id: string): Promise<void> {
    const index = state().jobs.findIndex((job) => job.userId === userId && job.id === id);
    if (index < 0) throw new ResourceNotFoundError("Job");
    state().jobs.splice(index, 1);
    state().history = state().history.filter((event) => event.jobId !== id);
    state().generatedCvs = state().generatedCvs.filter((cv) => cv.jobId !== id);
  }

  async listStatusHistory(userId: string, jobId?: string): Promise<JobStatusHistory[]> {
    return state()
      .history.filter((event) => event.userId === userId)
      .filter((event) => !jobId || event.jobId === jobId)
      .map((event) => ({
        id: event.id,
        jobId: event.jobId,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        changedAt: event.changedAt,
      }));
  }

  async getFilters(userId: string): Promise<FilterSettings> {
    const existing = state().filters.get(userId);
    if (existing) return structuredClone(existing);
    const defaults = createDefaultFilterSettings();
    state().filters.set(userId, defaults);
    return structuredClone(defaults);
  }

  async saveFilters(userId: string, filters: FilterSettings): Promise<FilterSettings> {
    state().filters.set(userId, structuredClone(filters));
    return structuredClone(filters);
  }

  async listKnowledgeFiles(userId: string): Promise<KnowledgeFile[]> {
    return state()
      .files.filter((file) => file.userId === userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(publicFile);
  }

  async uploadKnowledgeFile(
    userId: string,
    file: { filename: string; mimeType: string; documentKind: KnowledgeFile["documentKind"]; bytes: Uint8Array },
  ): Promise<KnowledgeFile> {
    const stored: StoredKnowledgeFile = {
      id: crypto.randomUUID(),
      userId,
      originalName: file.filename,
      mimeType: file.mimeType,
      documentKind: file.documentKind,
      sizeBytes: file.bytes.byteLength,
      createdAt: new Date().toISOString(),
      bytes: file.bytes,
    };
    state().files.push(stored);
    return publicFile(stored);
  }

  async downloadKnowledgeFile(userId: string, id: string): Promise<StoredKnowledgeDownload> {
    const found = state().files.find((file) => file.userId === userId && file.id === id);
    if (!found) throw new ResourceNotFoundError("File");
    return {
      kind: "content",
      bytes: found.bytes,
      mimeType: found.mimeType,
      filename: found.originalName,
    };
  }

  async deleteKnowledgeFile(userId: string, id: string): Promise<void> {
    const index = state().files.findIndex((file) => file.userId === userId && file.id === id);
    if (index < 0) throw new ResourceNotFoundError("File");
    state().files.splice(index, 1);
  }

  async getCandidateProfile(userId: string): Promise<CandidateProfile | null> {
    const candidate = state().files
      .filter((file) => file.userId === userId && file.documentKind === "candidate_profile")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    if (!candidate) return null;
    const parsed = parseCandidateProfileBytes(candidate.bytes);
    if (!parsed.ok) throw new Error(`Stored candidate profile is invalid: ${parsed.message}`);
    return parsed.data;
  }

  async listResumeTemplates(userId: string): Promise<ResumeTemplate[]> {
    return state().templates.filter((template) => template.userId === userId).sort((left, right) => right.version - left.version).map(publicTemplate);
  }

  async getActiveResumeTemplate(userId: string): Promise<ResumeTemplate | null> {
    const template = state().templates.find((candidate) => candidate.userId === userId && candidate.active);
    return template ? publicTemplate(template) : null;
  }

  async uploadResumeTemplate(userId: string, file: { filename: string; mimeType: string; bytes: Uint8Array }): Promise<ResumeTemplate> {
    const userTemplates = state().templates.filter((template) => template.userId === userId);
    for (const template of userTemplates) template.active = false;
    const stored: StoredTemplate = { id: crypto.randomUUID(), userId, originalName: file.filename, mimeType: file.mimeType, sizeBytes: file.bytes.byteLength, version: Math.max(0, ...userTemplates.map((template) => template.version)) + 1, active: true, createdAt: new Date().toISOString(), bytes: file.bytes };
    state().templates.push(stored);
    return publicTemplate(stored);
  }

  async downloadResumeTemplate(userId: string, id: string): Promise<StoredResumeTemplate> {
    const template = state().templates.find((candidate) => candidate.userId === userId && candidate.id === id);
    if (!template) throw new ResourceNotFoundError("Resume template");
    return { bytes: template.bytes, mimeType: template.mimeType, filename: template.originalName, version: template.version };
  }

  async listResumeConfirmations(userId: string): Promise<ResumeConfirmation[]> {
    return state().confirmations.filter((confirmation) => confirmation.userId === userId).map((confirmation) => ({ key: confirmation.key, label: confirmation.label, level: confirmation.level, provenance: confirmation.provenance }));
  }

  async saveResumeConfirmation(userId: string, confirmation: ResumeConfirmation): Promise<ResumeConfirmation> {
    const existing = state().confirmations.find((candidate) => candidate.userId === userId && candidate.key === confirmation.key);
    if (existing) Object.assign(existing, structuredClone(confirmation));
    else state().confirmations.push({ userId, ...structuredClone(confirmation) });
    return structuredClone(confirmation);
  }

  async getJobResumeRequirements(userId: string, jobId: string): Promise<JobResumeRequirements | null> {
    const found = state().jobRequirements.find((candidate) => candidate.userId === userId && candidate.jobId === jobId);
    return found ? { analysis: structuredClone(found.analysis), requirements: structuredClone(found.requirements), updatedAt: found.updatedAt } : null;
  }

  async saveJobResumeRequirements(userId: string, jobId: string, input: { analysis: VacancyAnalysis; requirements: SavedJobRequirement[] }): Promise<JobResumeRequirements> {
    if (!state().jobs.some((job) => job.userId === userId && job.id === jobId)) throw new ResourceNotFoundError("Job");
    const updatedAt = new Date().toISOString();
    const existing = state().jobRequirements.find((candidate) => candidate.userId === userId && candidate.jobId === jobId);
    if (existing) Object.assign(existing, { analysis: structuredClone(input.analysis), requirements: structuredClone(input.requirements), updatedAt });
    else state().jobRequirements.push({ userId, jobId, analysis: structuredClone(input.analysis), requirements: structuredClone(input.requirements), updatedAt });
    return { analysis: structuredClone(input.analysis), requirements: structuredClone(input.requirements), updatedAt };
  }

  async createResumeGeneration(userId: string, jobId: string, idempotencyKey: string): Promise<ResumeGeneration> {
    if (!state().jobs.some((job) => job.userId === userId && job.id === jobId)) throw new ResourceNotFoundError("Job");
    const existing = state().generations.find((generation) => generation.userId === userId && generation.jobId === jobId && generation.idempotencyKey === idempotencyKey);
    if (existing) return publicGeneration(existing);
    const now = new Date().toISOString();
    const stored: StoredGeneration = { id: crypto.randomUUID(), userId, jobId, idempotencyKey, status: "analyzing", analysis: null, confirmations: [], strategy: null, generatedContent: null, critique: null, correction: null, currentStage: null, attemptCount: 0, nextRetryAt: null, errorCode: null, templateVersion: null, createdAt: now, updatedAt: now };
    state().generations.push(stored);
    return publicGeneration(stored);
  }

  async getResumeGeneration(userId: string, id: string): Promise<ResumeGeneration | null> {
    const generation = state().generations.find((candidate) => candidate.userId === userId && candidate.id === id);
    return generation ? publicGeneration(generation) : null;
  }

  async getLatestResumeGeneration(userId: string, jobId: string): Promise<ResumeGeneration | null> {
    const generation = state().generations.filter((candidate) => candidate.userId === userId && candidate.jobId === jobId).sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    return generation ? publicGeneration(generation) : null;
  }

  async updateResumeGeneration(userId: string, id: string, input: Parameters<AppStore["updateResumeGeneration"]>[2]): Promise<ResumeGeneration> {
    const generation = state().generations.find((candidate) => candidate.userId === userId && candidate.id === id);
    if (!generation) throw new ResourceNotFoundError("Resume generation");
    Object.assign(generation, input, { updatedAt: new Date(Math.max(Date.now(), new Date(generation.updatedAt).getTime() + 1)).toISOString() });
    return publicGeneration(generation);
  }

  async listGeneratedCvs(userId: string, jobId: string): Promise<GeneratedCv[]> {
    return state().generatedCvs
      .filter((cv) => cv.userId === userId && cv.jobId === jobId)
      .sort((left, right) => right.version - left.version)
      .map(publicGeneratedCv);
  }

  async createGeneratedCv(
    userId: string,
    jobId: string,
    input: { bytes: Uint8Array; content: GeneratedCv["content"]; aiProvider: string; aiModel: string; generationId?: string | null; templateVersion?: number | null },
  ): Promise<GeneratedCv> {
    if (!state().jobs.some((job) => job.userId === userId && job.id === jobId)) {
      throw new ResourceNotFoundError("Job");
    }
    if (input.generationId) {
      const committed = state().generatedCvs.find((cv) => cv.userId === userId && cv.jobId === jobId && cv.generationId === input.generationId);
      if (committed) return publicGeneratedCv(committed);
    }
    const version = nextCvVersion(
      state().generatedCvs.filter((cv) => cv.jobId === jobId).map((cv) => cv.version),
    );
    const stored: StoredGeneratedCv = {
      id: crypto.randomUUID(),
      userId,
      jobId,
      version,
      content: structuredClone(input.content),
      aiProvider: input.aiProvider,
      aiModel: input.aiModel,
      generationId: input.generationId ?? null,
      templateVersion: input.templateVersion ?? null,
      createdAt: new Date().toISOString(),
      bytes: input.bytes,
    };
    state().generatedCvs.push(stored);
    return publicGeneratedCv(stored);
  }

  async downloadGeneratedCv(
    userId: string,
    jobId: string,
    id: string,
    _download: boolean,
  ) {
    void _download;
    const cv = state().generatedCvs.find((candidate) =>
      candidate.userId === userId && candidate.jobId === jobId && candidate.id === id
    );
    if (!cv) throw new ResourceNotFoundError("CV");
    return {
      kind: "content" as const,
      bytes: cv.bytes,
      mimeType: "application/pdf",
      filename: `cv-v${cv.version}.pdf`,
    };
  }

  async resetForTests(): Promise<void> {
    globalThis.jobSearchTestState = initialState();
  }
}
