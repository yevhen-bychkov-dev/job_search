import "server-only";

import { createDefaultFilterSettings } from "@/features/filters/domain";
import type { FilterSettings } from "@/features/filters/types";
import { nextCvVersion, parseGeneratedCvContent, parseVacancyAnalysis, validateSavedJobRequirements } from "@/features/cvs/domain";
import type { ApprovedResumeSkill, GeneratedCv, GeneratedCvContent, JobResumeRequirements, ResumeConfirmation, ResumeGeneration, ResumeGenerationStatus, SavedJobRequirement, VacancyAnalysis } from "@/features/cvs/types";
import { jobDuplicateKey, matchesJobQuery } from "@/features/jobs/domain";
import type { Job, JobInput, JobQuery, JobStatus, JobStatusHistory } from "@/features/jobs/types";
import { parseCandidateProfileBytes, type CandidateProfile } from "@/features/knowledge/candidate-profile";
import type { KnowledgeFile } from "@/features/knowledge/types";
import type { Database, Json } from "@/lib/supabase/database.types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { reportUnexpectedError } from "@/lib/server-errors";

import {
  type AppStore,
  ArtifactPersistenceError,
  ConcurrentModificationError,
  DataConsistencyError,
  DuplicateJobError,
  ResourceNotFoundError,
  type ResumeTemplate,
  type StoredKnowledgeDownload,
  type StoredResumeTemplate,
} from "./contracts";

type JobRow = Awaited<ReturnType<typeof getJobRows>>[number];

const RESUME_GENERATION_SELECT = "id,job_id,status,idempotency_key,analysis_json,confirmations_json,generation_json,current_stage,attempt_count,next_retry_at,lease_expires_at,error_code,template_version,ai_provider,ai_model,created_at,updated_at";
const ACTIVE_GENERATION_STATUSES: ResumeGenerationStatus[] = ["analyzing", "awaiting_confirmation", "strategizing", "generating", "critiquing", "correcting", "rendering", "retrying"];

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
  generation_id: string | null;
  template_version: number | null;
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
    generationId: row.generation_id,
    templateVersion: row.template_version,
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

  async listResumeTemplates(userId: string): Promise<ResumeTemplate[]> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.from("resume_templates").select("id,original_name,size_bytes,version,active,created_at").eq("user_id", userId).order("version", { ascending: false });
    if (error) throw new Error(`Unable to load resume templates: ${error.message}`);
    return data.map((row) => ({ id: row.id, originalName: row.original_name, sizeBytes: row.size_bytes, version: row.version, active: row.active, createdAt: row.created_at }));
  }

  async getActiveResumeTemplate(userId: string): Promise<ResumeTemplate | null> {
    const templates = await this.listResumeTemplates(userId);
    return templates.find((template) => template.active) ?? null;
  }

  async uploadResumeTemplate(userId: string, file: { filename: string; mimeType: string; bytes: Uint8Array }): Promise<ResumeTemplate> {
    const supabase = await createServerSupabaseClient();
    const previousActive = await supabase.from("resume_templates").select("id").eq("user_id", userId).eq("active", true).maybeSingle();
    if (previousActive.error) throw new Error(`Unable to load the active resume template: ${previousActive.error.message}`);
    const versionResult = await supabase.from("resume_templates").select("version").eq("user_id", userId).order("version", { ascending: false }).limit(1).maybeSingle();
    if (versionResult.error) throw new Error(`Unable to allocate template version: ${versionResult.error.message}`);
    const version = (versionResult.data?.version ?? 0) + 1;
    const id = crypto.randomUUID();
    const objectPath = `${userId}/${id}.html`;
    const upload = await supabase.storage.from("resume-templates").upload(objectPath, file.bytes, { contentType: file.mimeType, upsert: false });
    if (upload.error) throw new Error(`Unable to upload resume template: ${upload.error.message}`);
    const cleanup = async (message: string): Promise<never> => {
      const removed = await supabase.storage.from("resume-templates").remove([objectPath]);
      const restored = previousActive.data ? await supabase.from("resume_templates").update({ active: true }).eq("user_id", userId).eq("id", previousActive.data.id) : { error: null };
      if (removed.error || restored.error) { reportUnexpectedError("resume-template.upload.compensation", removed.error ?? restored.error); throw new DataConsistencyError(`${message} The previous active template could not be restored cleanly.`); }
      throw new Error(message);
    };
    const metadata = await supabase.from("resume_templates").update({ active: false }).eq("user_id", userId).eq("active", true);
    if (metadata.error) return cleanup(`Unable to deactivate the previous resume template: ${metadata.error.message}`);
    const created = await supabase.from("resume_templates").insert({ id, user_id: userId, object_path: objectPath, original_name: file.filename, size_bytes: file.bytes.byteLength, version, active: true }).select("id,original_name,size_bytes,version,active,created_at").single();
    if (created.error) return cleanup(`Unable to record resume template: ${created.error.message}`);
    return { id: created.data.id, originalName: created.data.original_name, sizeBytes: created.data.size_bytes, version: created.data.version, active: created.data.active, createdAt: created.data.created_at };
  }

  async downloadResumeTemplate(userId: string, id: string): Promise<StoredResumeTemplate> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.from("resume_templates").select("object_path,original_name,version").eq("user_id", userId).eq("id", id).maybeSingle();
    if (error) throw new Error(`Unable to load resume template: ${error.message}`);
    if (!data) throw new ResourceNotFoundError("Resume template");
    const download = await supabase.storage.from("resume-templates").download(data.object_path);
    if (download.error) throw new Error(`Unable to download resume template: ${download.error.message}`);
    return { bytes: new Uint8Array(await download.data.arrayBuffer()), mimeType: "text/html", filename: data.original_name, version: data.version };
  }

  async listResumeConfirmations(userId: string): Promise<ResumeConfirmation[]> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.from("resume_confirmations").select("requirement_key,label,level,provenance").eq("user_id", userId).order("updated_at", { ascending: false });
    if (error) throw new Error(`Unable to load resume confirmations: ${error.message}`);
    return data.map((row) => ({ key: row.requirement_key, label: row.label, level: row.level, provenance: row.provenance as ResumeConfirmation["provenance"] }));
  }

  async saveResumeConfirmation(userId: string, confirmation: ResumeConfirmation): Promise<ResumeConfirmation> {
    const supabase = await createServerSupabaseClient();
    const updated = await supabase.from("resume_confirmations").update({ label: confirmation.label, level: confirmation.level, provenance: confirmation.provenance }).eq("user_id", userId).eq("requirement_key", confirmation.key).select("requirement_key").maybeSingle();
    if (updated.error) throw new Error(`Unable to update resume confirmation: ${updated.error.message}`);
    if (!updated.data) {
      const inserted = await supabase.from("resume_confirmations").insert({ user_id: userId, requirement_key: confirmation.key, label: confirmation.label, level: confirmation.level, provenance: confirmation.provenance });
      if (inserted.error && inserted.error.code !== "23505") throw new Error(`Unable to save resume confirmation: ${inserted.error.message}`);
      if (inserted.error) {
        const retried = await supabase.from("resume_confirmations").update({ label: confirmation.label, level: confirmation.level, provenance: confirmation.provenance }).eq("user_id", userId).eq("requirement_key", confirmation.key);
        if (retried.error) throw new Error(`Unable to save resume confirmation after a concurrent update: ${retried.error.message}`);
      }
    }
    return confirmation;
  }

  async getJobResumeRequirements(userId: string, jobId: string): Promise<JobResumeRequirements | null> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.from("job_resume_requirements").select("analysis_json,requirements_json,approved_at,updated_at").eq("user_id", userId).eq("job_id", jobId).maybeSingle();
    if (error) throw new Error(`Unable to load job resume requirements: ${error.message}`);
    if (!data) return null;
    const analysis = parseVacancyAnalysis(data.analysis_json);
    const requirements = validateSavedJobRequirements(data.requirements_json);
    if (!analysis.ok || !requirements.ok) throw new DataConsistencyError("Stored resume skill suggestions are invalid.");
    return { analysis: analysis.data, requirements: requirements.data, approvedAt: data.approved_at, updatedAt: data.updated_at };
  }

  async saveJobResumeRequirements(userId: string, jobId: string, input: { analysis: VacancyAnalysis; requirements: SavedJobRequirement[]; approvedAt: string | null }): Promise<JobResumeRequirements> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.from("job_resume_requirements").upsert({ user_id: userId, job_id: jobId, analysis_json: input.analysis as unknown as Json, requirements_json: input.requirements as unknown as Json, approved_at: input.approvedAt }, { onConflict: "job_id" }).select("analysis_json,requirements_json,approved_at,updated_at").single();
    if (error) throw new Error(`Unable to save job resume requirements: ${error.message}`);
    return { analysis: data.analysis_json as VacancyAnalysis, requirements: data.requirements_json as SavedJobRequirement[], approvedAt: data.approved_at, updatedAt: data.updated_at };
  }

  private toResumeGeneration(row: { id: string; job_id: string; status: ResumeGenerationStatus; idempotency_key: string; analysis_json: Json | null; confirmations_json: Json; generation_json: Json | null; current_stage: string | null; attempt_count: number; next_retry_at: string | null; lease_expires_at: string | null; error_code: string | null; template_version: number | null; ai_provider: string | null; ai_model: string | null; created_at: string; updated_at: string }): ResumeGeneration {
    const analysis = row.analysis_json as VacancyAnalysis | null;
    const approvedSkills = row.confirmations_json as ApprovedResumeSkill[];
    return { id: row.id, jobId: row.job_id, status: row.status, idempotencyKey: row.idempotency_key, analysis, approvedSkills, generatedContent: row.generation_json as GeneratedCvContent | null, currentStage: row.current_stage === "render" ? "render" : row.current_stage === null ? null : "generation", attemptCount: row.attempt_count, nextRetryAt: row.next_retry_at, leaseExpiresAt: row.lease_expires_at, errorCode: row.error_code, templateVersion: row.template_version, aiProvider: row.ai_provider, aiModel: row.ai_model, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  async createResumeGeneration(userId: string, jobId: string, idempotencyKey: string): Promise<ResumeGeneration> {
    if (!(await this.getJob(userId, jobId))) throw new ResourceNotFoundError("Job");
    const supabase = await createServerSupabaseClient();
    const created = await supabase.from("resume_generations").insert({ user_id: userId, job_id: jobId, idempotency_key: idempotencyKey, status: "analyzing", confirmations_json: [] }).select(RESUME_GENERATION_SELECT).maybeSingle();
    if (!created.error && created.data) return this.toResumeGeneration(created.data);
    if (created.error?.code !== "23505") throw new Error(`Unable to create resume generation: ${created.error?.message ?? "unknown error"}`);
    const existing = await supabase.from("resume_generations").select(RESUME_GENERATION_SELECT).eq("user_id", userId).eq("job_id", jobId).eq("idempotency_key", idempotencyKey).maybeSingle();
    if (existing.error) throw new Error(`Unable to load existing resume generation: ${existing.error.message}`);
    if (existing.data) return this.toResumeGeneration(existing.data);
    const active = await supabase.from("resume_generations").select(RESUME_GENERATION_SELECT).eq("user_id", userId).eq("job_id", jobId).in("status", ACTIVE_GENERATION_STATUSES).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (active.error) throw new Error(`Unable to load the active resume generation: ${active.error.message}`);
    if (!active.data) throw new Error("A concurrent resume generation could not be recovered.");
    return this.toResumeGeneration(active.data);
  }

  async getResumeGeneration(userId: string, id: string): Promise<ResumeGeneration | null> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.from("resume_generations").select(RESUME_GENERATION_SELECT).eq("user_id", userId).eq("id", id).maybeSingle();
    if (error) throw new Error(`Unable to load resume generation: ${error.message}`);
    return data ? this.toResumeGeneration(data) : null;
  }

  async getLatestResumeGeneration(userId: string, jobId: string): Promise<ResumeGeneration | null> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.from("resume_generations").select(RESUME_GENERATION_SELECT).eq("user_id", userId).eq("job_id", jobId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(`Unable to load latest resume generation: ${error.message}`);
    return data ? this.toResumeGeneration(data) : null;
  }

  async updateResumeGeneration(userId: string, id: string, input: Parameters<AppStore["updateResumeGeneration"]>[2]): Promise<ResumeGeneration> {
    const supabase = await createServerSupabaseClient();
    const update: Database["public"]["Tables"]["resume_generations"]["Update"] = { status: input.status };
    if (input.analysis !== undefined) update.analysis_json = input.analysis as unknown as Json;
    if (input.approvedSkills !== undefined) update.confirmations_json = input.approvedSkills as unknown as Json;
    if (input.generatedContent !== undefined) update.generation_json = input.generatedContent as unknown as Json | null;
    if (input.currentStage !== undefined) update.current_stage = input.currentStage;
    if (input.attemptCount !== undefined) update.attempt_count = input.attemptCount;
    if (input.nextRetryAt !== undefined) update.next_retry_at = input.nextRetryAt;
    if (input.leaseExpiresAt !== undefined) update.lease_expires_at = input.leaseExpiresAt;
    if (input.errorCode !== undefined) update.error_code = input.errorCode;
    if (input.templateVersion !== undefined) update.template_version = input.templateVersion;
    if (input.aiProvider !== undefined) update.ai_provider = input.aiProvider;
    if (input.aiModel !== undefined) update.ai_model = input.aiModel;
    const { data, error } = await supabase.from("resume_generations").update(update).eq("user_id", userId).eq("id", id).select(RESUME_GENERATION_SELECT).single();
    if (error) throw new Error(`Unable to update resume generation: ${error.message}`);
    return this.toResumeGeneration(data);
  }

  async claimResumeGeneration(userId: string, id: string, input: Parameters<AppStore["claimResumeGeneration"]>[2]): Promise<ResumeGeneration | null> {
    const supabase = await createServerSupabaseClient();
    const now = new Date().toISOString();
    const update: Database["public"]["Tables"]["resume_generations"]["Update"] = {
      status: input.status,
      current_stage: input.currentStage,
      lease_expires_at: input.leaseExpiresAt,
      next_retry_at: null,
      error_code: null,
    };
    if (input.analysis !== undefined) update.analysis_json = input.analysis as unknown as Json;
    if (input.approvedSkills !== undefined) update.confirmations_json = input.approvedSkills as unknown as Json;
    if (input.templateVersion !== undefined) update.template_version = input.templateVersion;
    const { data, error } = await supabase.from("resume_generations")
      .update(update)
      .eq("user_id", userId)
      .eq("id", id)
      .eq("updated_at", input.expectedUpdatedAt)
      .or(`lease_expires_at.is.null,lease_expires_at.lt.${now}`)
      .select(RESUME_GENERATION_SELECT)
      .maybeSingle();
    if (error) throw new Error(`Unable to claim resume generation stage: ${error.message}`);
    return data ? this.toResumeGeneration(data) : null;
  }

  async listGeneratedCvs(userId: string, jobId: string): Promise<GeneratedCv[]> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("generated_cvs")
      .select("id,job_id,version,content_json,ai_provider,ai_model,generation_id,template_version,created_at")
      .eq("user_id", userId)
      .eq("job_id", jobId)
      .order("version", { ascending: false });
    if (error) throw new Error(`Unable to load generated CVs: ${error.message}`);
    return data.map(toGeneratedCv);
  }

  async createGeneratedCv(
    userId: string,
    jobId: string,
    input: { bytes: Uint8Array; content: GeneratedCv["content"]; aiProvider: string; aiModel: string; generationId?: string | null; templateVersion?: number | null },
  ): Promise<GeneratedCv> {
    if (!(await this.getJob(userId, jobId))) throw new ResourceNotFoundError("Job");
    const supabase = await createServerSupabaseClient();
    const id = crypto.randomUUID();
    const objectPath = `${userId}/${jobId}/${id}.pdf`;
    const upload = await supabase.storage.from("generated-cvs").upload(objectPath, input.bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (upload.error) throw new ArtifactPersistenceError("upload", "Unable to upload the generated CV.", { cause: upload.error });

    const removeUploadedObject = async (): Promise<void> => {
      const cleanup = await supabase.storage.from("generated-cvs").remove([objectPath]);
      if (cleanup.error) {
        reportUnexpectedError("cvs.create.compensation", cleanup.error);
        throw new ArtifactPersistenceError("cleanup", "The uploaded PDF could not be cleaned up.", { cause: cleanup.error });
      }
    };
    const cleanupUpload = async (reason: string): Promise<never> => {
      await removeUploadedObject();
      throw new ArtifactPersistenceError("metadata", reason);
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
          generation_id: input.generationId ?? null,
          template_version: input.templateVersion ?? null,
        })
        .select("id,job_id,version,content_json,ai_provider,ai_model,generation_id,template_version,created_at")
        .single();
      if (!created.error) return toGeneratedCv(created.data);
      if (created.error.code !== "23505") return cleanupUpload(`Unable to record generated CV: ${created.error.message}`);
      const committed = await supabase
        .from("generated_cvs")
        .select("id,job_id,version,content_json,ai_provider,ai_model,generation_id,template_version,created_at")
        .eq("user_id", userId)
        .eq("job_id", jobId)
        .eq("id", id)
        .maybeSingle();
      if (committed.error) return cleanupUpload(`Unable to verify a concurrent CV insert: ${committed.error.message}`);
      if (committed.data) {
        await removeUploadedObject();
        return toGeneratedCv(committed.data);
      }
      if (input.generationId) {
        const generationCommitted = await supabase
          .from("generated_cvs")
          .select("id,job_id,version,content_json,ai_provider,ai_model,generation_id,template_version,created_at")
          .eq("user_id", userId)
          .eq("job_id", jobId)
          .eq("generation_id", input.generationId)
          .maybeSingle();
        if (generationCommitted.error) return cleanupUpload(`Unable to verify a concurrent generation insert: ${generationCommitted.error.message}`);
        if (generationCommitted.data) {
          await removeUploadedObject();
          return toGeneratedCv(generationCommitted.data);
        }
      }
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
