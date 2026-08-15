import "server-only";

import { createDefaultFilterSettings } from "@/features/filters/domain";
import type { FilterSettings } from "@/features/filters/types";
import { jobDuplicateKey, matchesJobQuery } from "@/features/jobs/domain";
import type { Job, JobInput, JobQuery, JobStatus, JobStatusHistory } from "@/features/jobs/types";
import type { KnowledgeFile } from "@/features/knowledge/types";

import {
  type AppStore,
  ConcurrentModificationError,
  DuplicateJobError,
  ResourceNotFoundError,
  type StoredKnowledgeDownload,
} from "./contracts";

type StoredKnowledgeFile = KnowledgeFile & {
  userId: string;
  bytes: Uint8Array;
};

type MemoryState = {
  jobs: Array<Job & { userId: string; duplicateKey: string }>;
  history: Array<JobStatusHistory & { userId: string }>;
  filters: Map<string, FilterSettings>;
  files: StoredKnowledgeFile[];
  ignoredExternalJobs: Array<{ userId: string; source: string; externalJobId: string }>;
};

declare global {
  var jobSearchTestState: MemoryState | undefined;
}

function initialState(): MemoryState {
  return { jobs: [], history: [], filters: new Map(), files: [], ignoredExternalJobs: [] };
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
    sizeBytes: record.sizeBytes,
    createdAt: record.createdAt,
  };
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
    file: { filename: string; mimeType: string; bytes: Uint8Array },
  ): Promise<KnowledgeFile> {
    const stored: StoredKnowledgeFile = {
      id: crypto.randomUUID(),
      userId,
      originalName: file.filename,
      mimeType: file.mimeType,
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

  async resetForTests(): Promise<void> {
    globalThis.jobSearchTestState = initialState();
  }
}
