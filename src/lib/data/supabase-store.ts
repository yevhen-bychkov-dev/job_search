import "server-only";

import { createDefaultFilterSettings } from "@/features/filters/domain";
import type { FilterSettings } from "@/features/filters/types";
import { nextCvVersion, parseGeneratedCvContent } from "@/features/cvs/domain";
import type { GeneratedCv } from "@/features/cvs/types";
import { jobDuplicateKey, matchesJobQuery } from "@/features/jobs/domain";
import type { Job, JobInput, JobQuery, JobStatus, JobStatusHistory } from "@/features/jobs/types";
import { parseCandidateProfileBytes, type CandidateProfile } from "@/features/knowledge/candidate-profile";
import type { KnowledgeFile } from "@/features/knowledge/types";
import type { Json } from "@/lib/supabase/database.types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { reportUnexpectedError } from "@/lib/server-errors";

import {
  type AppStore,
  ConcurrentModificationError,
  DataConsistencyError,
  DuplicateJobError,
  ResourceNotFoundError,
  type StoredKnowledgeDownload,
} from "./contracts";

type JobRow = Awaited<ReturnType<typeof getJobRows>>[number];

async function getJobRows(userId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("jobs")
    .select(
      "id,title,company,status,source,source_url,external_source,external_job_id,location,work_mode,employment_type,salary,description,technologies,notes,discovered_on,applied_on,created_at,updated_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Unable to load jobs: ${error.message}`);
  return data;
}

function toJob(row: JobRow): Job {
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    status: row.status,
    source: row.source,
    sourceUrl: row.source_url,
    externalSource: row.external_source ?? "",
    externalJobId: row.external_job_id ?? "",
    location: row.location,
    workMode: row.work_mode,
    employmentType: row.employment_type,
    salary: row.salary,
    description: row.description,
    technologies: row.technologies,
    notes: row.notes,
    discoveredOn: row.discovered_on,
    appliedOn: row.applied_on ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function jobInsert(userId: string, input: JobInput) {
  return {
    user_id: userId,
    title: input.title,
    company: input.company,
    status: input.status,
    source: input.source,
    source_url: input.sourceUrl,
    external_source: input.externalSource || null,
    external_job_id: input.externalJobId || null,
    location: input.location,
    work_mode: input.workMode,
    employment_type: input.employmentType,
    salary: input.salary,
    description: input.description,
    technologies: input.technologies,
    notes: input.notes,
    discovered_on: input.discoveredOn,
    applied_on: input.appliedOn || null,
    dedupe_key: jobDuplicateKey(input),
  };
}

function throwDataError(prefix: string, error: { code?: string; message: string }): never {
  if (error.code === "23505") throw new DuplicateJobError();
  throw new Error(`${prefix}: ${error.message}`);
}

function toGeneratedCv(row: {
  id: string;
  job_id: string;
  version: number;
  content_json: Json;
  ai_provider: string;
  ai_model: string;
  created_at: string;
}): GeneratedCv {
  const content = parseGeneratedCvContent(row.content_json);
  if (!content.ok) throw new DataConsistencyError(content.message);
  return {
    id: row.id,
    jobId: row.job_id,
    version: row.version,
    content: content.data,
    aiProvider: row.ai_provider,
    aiModel: row.ai_model,
    createdAt: row.created_at,
  };
}

export class SupabaseAppStore implements AppStore {
  async listJobs(userId: string, query: JobQuery = {}): Promise<Job[]> {
    return (await getJobRows(userId))
      .map(toJob)
      .filter((job) => !query.status || job.status === query.status)
      .filter((job) => !query.workMode || job.workMode === query.workMode)
      .filter((job) => matchesJobQuery(job, query.search ?? ""));
  }

  async getJob(userId: string, id: string): Promise<Job | null> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("jobs")
      .select(
        "id,title,company,status,source,source_url,external_source,external_job_id,location,work_mode,employment_type,salary,description,technologies,notes,discovered_on,applied_on,created_at,updated_at",
      )
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Unable to load job: ${error.message}`);
    return data ? toJob(data) : null;
  }

  async createJob(userId: string, input: JobInput): Promise<Job> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("jobs")
      .insert(jobInsert(userId, input))
      .select(
        "id,title,company,status,source,source_url,external_source,external_job_id,location,work_mode,employment_type,salary,description,technologies,notes,discovered_on,applied_on,created_at,updated_at",
      )
      .single();
    if (error) throwDataError("Unable to create job", error);
    return toJob(data);
  }

  async importJobs(
    userId: string,
    inputs: JobInput[],
  ): Promise<{ imported: number; duplicates: number }> {
    if (inputs.length === 0) return { imported: 0, duplicates: 0 };
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("jobs")
      .upsert(inputs.map((input) => jobInsert(userId, input)), {
        onConflict: "user_id,dedupe_key",
        ignoreDuplicates: true,
      })
      .select("id");
    if (error) throw new Error(`Unable to import jobs: ${error.message}`);
    return { imported: data.length, duplicates: inputs.length - data.length };
  }

  async listExternalJobIds(
    userId: string,
    source: string,
  ): Promise<{ saved: string[]; ignored: string[]; savedUrls: string[] }> {
    const supabase = await createServerSupabaseClient();
    const [savedResult, ignoredResult] = await Promise.all([
      supabase
        .from("jobs")
        .select("external_source,external_job_id,source_url")
        .eq("user_id", userId),
      supabase
        .from("ignored_external_jobs")
        .select("external_job_id")
        .eq("user_id", userId)
        .eq("source", source),
    ]);
    if (savedResult.error) throw new Error(`Unable to load saved external jobs: ${savedResult.error.message}`);
    if (ignoredResult.error) throw new Error(`Unable to load ignored external jobs: ${ignoredResult.error.message}`);
    return {
      saved: savedResult.data.flatMap((row) => row.external_source === source && row.external_job_id ? [row.external_job_id] : []),
      savedUrls: savedResult.data.flatMap((row) =>
        (!row.external_source || row.external_source === source) && row.source_url ? [row.source_url] : []
      ),
      ignored: ignoredResult.data.map((row) => row.external_job_id),
    };
  }

  async ignoreExternalJob(userId: string, source: string, externalJobId: string): Promise<void> {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.from("ignored_external_jobs").upsert(
      { user_id: userId, source, external_job_id: externalJobId },
      { onConflict: "user_id,source,external_job_id", ignoreDuplicates: true },
    );
    if (error) throw new Error(`Unable to ignore external job: ${error.message}`);
  }

  async updateJob(
    userId: string,
    id: string,
    input: JobInput,
    expectedUpdatedAt: string,
  ): Promise<Job> {
    const supabase = await createServerSupabaseClient();
    const existing = await this.getJob(userId, id);
    if (!existing) throw new ResourceNotFoundError("Job");
    const identityInput: JobInput = {
      ...input,
      externalSource: existing.externalSource,
      externalJobId: existing.externalJobId,
    };
    const update = {
      title: input.title,
      company: input.company,
      status: input.status,
      source: input.source,
      source_url: input.sourceUrl,
      external_source: identityInput.externalSource || null,
      external_job_id: identityInput.externalJobId || null,
      location: input.location,
      work_mode: input.workMode,
      employment_type: input.employmentType,
      salary: input.salary,
      description: input.description,
      technologies: input.technologies,
      notes: input.notes,
      discovered_on: input.discoveredOn,
      applied_on: input.appliedOn || null,
      dedupe_key: jobDuplicateKey(identityInput),
    };
    const { data, error } = await supabase
      .from("jobs")
      .update(update)
      .eq("user_id", userId)
      .eq("id", id)
      .eq("updated_at", expectedUpdatedAt)
      .select(
        "id,title,company,status,source,source_url,external_source,external_job_id,location,work_mode,employment_type,salary,description,technologies,notes,discovered_on,applied_on,created_at,updated_at",
      )
      .maybeSingle();
    if (error) throwDataError("Unable to update job", error);
    if (!data) {
      if (await this.getJob(userId, id)) throw new ConcurrentModificationError();
      throw new ResourceNotFoundError("Job");
    }
    return toJob(data);
  }

  async updateJobStatus(
    userId: string,
    id: string,
    status: JobStatus,
    appliedOn: string,
  ): Promise<Job> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("jobs")
      .update({ status })
      .eq("user_id", userId)
      .eq("id", id)
      .select(
        "id,title,company,status,source,source_url,external_source,external_job_id,location,work_mode,employment_type,salary,description,technologies,notes,discovered_on,applied_on,created_at,updated_at",
      )
      .maybeSingle();
    if (error) throw new Error(`Unable to update job status: ${error.message}`);
    if (!data) throw new ResourceNotFoundError("Job");
    if (status === "applied" && !data.applied_on) {
      const appliedDateUpdate = await supabase
        .from("jobs")
        .update({ applied_on: appliedOn })
        .eq("user_id", userId)
        .eq("id", id)
        .eq("status", "applied")
        .is("applied_on", null)
        .select(
          "id,title,company,status,source,source_url,external_source,external_job_id,location,work_mode,employment_type,salary,description,technologies,notes,discovered_on,applied_on,created_at,updated_at",
        )
        .maybeSingle();
      if (appliedDateUpdate.error) {
        throw new Error(`Unable to set the applied date: ${appliedDateUpdate.error.message}`);
      }
      if (appliedDateUpdate.data) return toJob(appliedDateUpdate.data);
      const latest = await this.getJob(userId, id);
      if (!latest) throw new ResourceNotFoundError("Job");
      return latest;
    }
    return toJob(data);
  }

  async deleteJob(userId: string, id: string): Promise<void> {
    const supabase = await createServerSupabaseClient();
    const cvFiles = await supabase
      .from("generated_cvs")
      .select("file_path")
      .eq("user_id", userId)
      .eq("job_id", id);
    if (cvFiles.error) throw new Error(`Unable to prepare CV cleanup: ${cvFiles.error.message}`);
    const { data, error } = await supabase
      .from("jobs")
      .delete()
      .eq("user_id", userId)
      .eq("id", id)
      .select("id");
    if (error) throw new Error(`Unable to delete job: ${error.message}`);
    if (data.length === 0) throw new ResourceNotFoundError("Job");
    if (cvFiles.data.length) {
      const cleanup = await supabase.storage.from("generated-cvs").remove(cvFiles.data.map((cv) => cv.file_path));
      if (cleanup.error) reportUnexpectedError("cvs.job-delete.cleanup", cleanup.error);
    }
  }

  async listStatusHistory(userId: string, jobId?: string): Promise<JobStatusHistory[]> {
    const supabase = await createServerSupabaseClient();
    let jobsQuery = supabase.from("jobs").select("id").eq("user_id", userId);
    if (jobId) jobsQuery = jobsQuery.eq("id", jobId);
    const { data: ownedJobs, error: jobsError } = await jobsQuery;
    if (jobsError) throw new Error(`Unable to scope status history: ${jobsError.message}`);
    if (ownedJobs.length === 0) return [];
    const { data, error } = await supabase
      .from("job_status_history")
      .select("id,job_id,from_status,to_status,changed_at")
      .in("job_id", ownedJobs.map((job) => job.id))
      .order("changed_at", { ascending: true });
    if (error) throw new Error(`Unable to load status history: ${error.message}`);
    return data.map((row) => ({
      id: row.id,
      jobId: row.job_id,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      changedAt: row.changed_at,
    }));
  }

  async getFilters(userId: string): Promise<FilterSettings> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("user_filters")
      .select("included_technologies,excluded_technologies,preferred_titles,updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(`Unable to load filters: ${error.message}`);
    if (data) {
      return {
        includedTechnologies: data.included_technologies,
        excludedTechnologies: data.excluded_technologies,
        preferredTitles: data.preferred_titles,
        updatedAt: data.updated_at,
      };
    }
    return this.saveFilters(userId, createDefaultFilterSettings());
  }

  async saveFilters(userId: string, filters: FilterSettings): Promise<FilterSettings> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("user_filters")
      .upsert({
        user_id: userId,
        included_technologies: filters.includedTechnologies,
        excluded_technologies: filters.excludedTechnologies,
        preferred_titles: filters.preferredTitles,
      })
      .select("included_technologies,excluded_technologies,preferred_titles,updated_at")
      .single();
    if (error) throw new Error(`Unable to save filters: ${error.message}`);
    return {
      includedTechnologies: data.included_technologies,
      excludedTechnologies: data.excluded_technologies,
      preferredTitles: data.preferred_titles,
      updatedAt: data.updated_at,
    };
  }

  async listKnowledgeFiles(userId: string): Promise<KnowledgeFile[]> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("knowledge_files")
      .select("id,original_name,mime_type,document_kind,size_bytes,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Unable to load files: ${error.message}`);
    return data.map((row) => ({
      id: row.id,
      originalName: row.original_name,
      mimeType: row.mime_type,
      documentKind: row.document_kind,
      sizeBytes: row.size_bytes,
      createdAt: row.created_at,
    }));
  }

  async uploadKnowledgeFile(
    userId: string,
    file: { filename: string; mimeType: string; documentKind: KnowledgeFile["documentKind"]; bytes: Uint8Array },
  ): Promise<KnowledgeFile> {
    const supabase = await createServerSupabaseClient();
    const objectPath = `${userId}/${crypto.randomUUID()}-${file.filename}`;
    const upload = await supabase.storage.from("knowledge-base").upload(objectPath, file.bytes, {
      contentType: file.mimeType,
      upsert: false,
    });
    if (upload.error) throw new Error(`Unable to upload file: ${upload.error.message}`);
    const metadata = await supabase
      .from("knowledge_files")
      .insert({
        user_id: userId,
        object_path: objectPath,
        original_name: file.filename,
        mime_type: file.mimeType,
        document_kind: file.documentKind,
        size_bytes: file.bytes.byteLength,
      })
      .select("id,original_name,mime_type,document_kind,size_bytes,created_at")
      .single();
    if (metadata.error) {
      const cleanup = await supabase.storage.from("knowledge-base").remove([objectPath]);
      if (cleanup.error) {
        reportUnexpectedError("knowledge.upload.compensation", cleanup.error);
        throw new DataConsistencyError(
          "File metadata failed and the uploaded object could not be cleaned up.",
        );
      }
      throw new Error(`Unable to record file metadata: ${metadata.error.message}`);
    }
    return {
      id: metadata.data.id,
      originalName: metadata.data.original_name,
      mimeType: metadata.data.mime_type,
      documentKind: metadata.data.document_kind,
      sizeBytes: metadata.data.size_bytes,
      createdAt: metadata.data.created_at,
    };
  }

  async downloadKnowledgeFile(userId: string, id: string): Promise<StoredKnowledgeDownload> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("knowledge_files")
      .select("object_path")
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Unable to load file: ${error.message}`);
    if (!data) throw new ResourceNotFoundError("File");
    const signed = await supabase.storage.from("knowledge-base").createSignedUrl(data.object_path, 60);
    if (signed.error) throw new Error(`Unable to open file: ${signed.error.message}`);
    return { kind: "redirect", url: signed.data.signedUrl };
  }

  async deleteKnowledgeFile(userId: string, id: string): Promise<void> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("knowledge_files")
      .select("object_path,mime_type")
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Unable to load file metadata: ${error.message}`);
    if (!data) throw new ResourceNotFoundError("File");

    const backup = await supabase.storage.from("knowledge-base").download(data.object_path);
    if (backup.error) throw new Error(`Unable to prepare file deletion: ${backup.error.message}`);
    const backupBytes = new Uint8Array(await backup.data.arrayBuffer());
    const removal = await supabase.storage.from("knowledge-base").remove([data.object_path]);
    if (removal.error) throw new Error(`Unable to delete stored file: ${removal.error.message}`);

    const metadata = await supabase
      .from("knowledge_files")
      .delete()
      .eq("user_id", userId)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (metadata.error) {
      const restore = await supabase.storage.from("knowledge-base").upload(
        data.object_path,
        backupBytes,
        { contentType: data.mime_type, upsert: false },
      );
      if (restore.error) {
        reportUnexpectedError("knowledge.delete.compensation", restore.error);
        throw new DataConsistencyError(
          "File metadata remained after deletion and the object could not be restored.",
        );
      }
      throw new Error(`Unable to delete file metadata: ${metadata.error.message}`);
    }
  }

  async getCandidateProfile(userId: string): Promise<CandidateProfile | null> {
    const supabase = await createServerSupabaseClient();
    const metadata = await supabase
      .from("knowledge_files")
      .select("object_path")
      .eq("user_id", userId)
      .eq("document_kind", "candidate_profile")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (metadata.error) throw new Error(`Unable to load candidate profile metadata: ${metadata.error.message}`);
    if (!metadata.data) return null;
    const download = await supabase.storage.from("knowledge-base").download(metadata.data.object_path);
    if (download.error) throw new Error(`Unable to load candidate profile: ${download.error.message}`);
    const parsed = parseCandidateProfileBytes(new Uint8Array(await download.data.arrayBuffer()));
    if (!parsed.ok) throw new DataConsistencyError(`Stored candidate profile is invalid: ${parsed.message}`);
    return parsed.data;
  }

  async listGeneratedCvs(userId: string, jobId: string): Promise<GeneratedCv[]> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("generated_cvs")
      .select("id,job_id,version,content_json,ai_provider,ai_model,created_at")
      .eq("user_id", userId)
      .eq("job_id", jobId)
      .order("version", { ascending: false });
    if (error) throw new Error(`Unable to load generated CVs: ${error.message}`);
    return data.map(toGeneratedCv);
  }

  async createGeneratedCv(
    userId: string,
    jobId: string,
    input: { bytes: Uint8Array; content: GeneratedCv["content"]; aiProvider: string; aiModel: string },
  ): Promise<GeneratedCv> {
    if (!(await this.getJob(userId, jobId))) throw new ResourceNotFoundError("Job");
    const supabase = await createServerSupabaseClient();
    const id = crypto.randomUUID();
    const objectPath = `${userId}/${jobId}/${id}.pdf`;
    const upload = await supabase.storage.from("generated-cvs").upload(objectPath, input.bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (upload.error) throw new Error(`Unable to upload generated CV: ${upload.error.message}`);

    const cleanupUpload = async (reason: string): Promise<never> => {
      const cleanup = await supabase.storage.from("generated-cvs").remove([objectPath]);
      if (cleanup.error) {
        reportUnexpectedError("cvs.create.compensation", cleanup.error);
        throw new DataConsistencyError(`${reason} The uploaded PDF could not be cleaned up.`);
      }
      throw new Error(reason);
    };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const existing = await supabase
        .from("generated_cvs")
        .select("version")
        .eq("user_id", userId)
        .eq("job_id", jobId)
        .order("version", { ascending: false })
        .limit(1);
      if (existing.error) return cleanupUpload(`Unable to calculate the next CV version: ${existing.error.message}`);
      const version = nextCvVersion(existing.data.map((row) => row.version));
      const created = await supabase
        .from("generated_cvs")
        .insert({
          id,
          user_id: userId,
          job_id: jobId,
          version,
          file_path: objectPath,
          content_json: input.content as unknown as Json,
          ai_provider: input.aiProvider,
          ai_model: input.aiModel,
        })
        .select("id,job_id,version,content_json,ai_provider,ai_model,created_at")
        .single();
      if (!created.error) return toGeneratedCv(created.data);
      if (created.error.code !== "23505") return cleanupUpload(`Unable to record generated CV: ${created.error.message}`);
      const committed = await supabase
        .from("generated_cvs")
        .select("id,job_id,version,content_json,ai_provider,ai_model,created_at")
        .eq("user_id", userId)
        .eq("job_id", jobId)
        .eq("id", id)
        .maybeSingle();
      if (committed.error) return cleanupUpload(`Unable to verify a concurrent CV insert: ${committed.error.message}`);
      if (committed.data) return toGeneratedCv(committed.data);
    }
    return cleanupUpload("Unable to allocate a unique CV version after several attempts.");
  }

  async downloadGeneratedCv(
    userId: string,
    jobId: string,
    id: string,
    download: boolean,
  ) {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("generated_cvs")
      .select("file_path,version")
      .eq("user_id", userId)
      .eq("job_id", jobId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Unable to load generated CV: ${error.message}`);
    if (!data) throw new ResourceNotFoundError("CV");
    const signed = download
      ? await supabase.storage.from("generated-cvs").createSignedUrl(data.file_path, 60, { download: `cv-v${data.version}.pdf` })
      : await supabase.storage.from("generated-cvs").createSignedUrl(data.file_path, 60);
    if (signed.error) throw new Error(`Unable to open generated CV: ${signed.error.message}`);
    return { kind: "redirect" as const, url: signed.data.signedUrl };
  }

  async resetForTests(): Promise<void> {
    throw new Error("The production Supabase store cannot be reset from the application.");
  }
}
