import "server-only";

import { createDefaultFilterSettings } from "@/features/filters/domain";
import type { FilterSettings } from "@/features/filters/types";
import { jobDuplicateKey, matchesJobQuery } from "@/features/jobs/domain";
import type { Job, JobInput, JobQuery, JobStatus, JobStatusHistory } from "@/features/jobs/types";
import type { KnowledgeFile } from "@/features/knowledge/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import {
  type AppStore,
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
      "id,title,company,status,source,source_url,location,work_mode,employment_type,salary,description,technologies,notes,discovered_on,applied_on,created_at,updated_at",
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
        "id,title,company,status,source,source_url,location,work_mode,employment_type,salary,description,technologies,notes,discovered_on,applied_on,created_at,updated_at",
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
        "id,title,company,status,source,source_url,location,work_mode,employment_type,salary,description,technologies,notes,discovered_on,applied_on,created_at,updated_at",
      )
      .single();
    if (error) throwDataError("Unable to create job", error);
    return toJob(data);
  }

  async updateJob(userId: string, id: string, input: JobInput): Promise<Job> {
    const supabase = await createServerSupabaseClient();
    const update = {
      title: input.title,
      company: input.company,
      status: input.status,
      source: input.source,
      source_url: input.sourceUrl,
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
    const { data, error } = await supabase
      .from("jobs")
      .update(update)
      .eq("user_id", userId)
      .eq("id", id)
      .select(
        "id,title,company,status,source,source_url,location,work_mode,employment_type,salary,description,technologies,notes,discovered_on,applied_on,created_at,updated_at",
      )
      .maybeSingle();
    if (error) throwDataError("Unable to update job", error);
    if (!data) throw new ResourceNotFoundError("Job");
    return toJob(data);
  }

  async updateJobStatus(
    userId: string,
    id: string,
    status: JobStatus,
    appliedOn: string,
  ): Promise<Job> {
    const current = await this.getJob(userId, id);
    if (!current) throw new ResourceNotFoundError("Job");
    return this.updateJob(userId, id, {
      ...current,
      status,
      appliedOn: !current.appliedOn && status === "applied" ? appliedOn : current.appliedOn,
    });
  }

  async deleteJob(userId: string, id: string): Promise<void> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("jobs")
      .delete()
      .eq("user_id", userId)
      .eq("id", id)
      .select("id");
    if (error) throw new Error(`Unable to delete job: ${error.message}`);
    if (data.length === 0) throw new ResourceNotFoundError("Job");
  }

  async listStatusHistory(userId: string): Promise<JobStatusHistory[]> {
    const jobs = await this.listJobs(userId);
    if (jobs.length === 0) return [];
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("job_status_history")
      .select("id,job_id,from_status,to_status,changed_at")
      .in(
        "job_id",
        jobs.map((job) => job.id),
      )
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

  async hasDuplicate(userId: string, duplicateKey: string): Promise<boolean> {
    const supabase = await createServerSupabaseClient();
    const { count, error } = await supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("dedupe_key", duplicateKey);
    if (error) throw new Error(`Unable to check duplicate jobs: ${error.message}`);
    return (count ?? 0) > 0;
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
      .select("id,original_name,mime_type,size_bytes,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Unable to load files: ${error.message}`);
    return data.map((row) => ({
      id: row.id,
      originalName: row.original_name,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      createdAt: row.created_at,
    }));
  }

  async uploadKnowledgeFile(
    userId: string,
    file: { filename: string; mimeType: string; bytes: Uint8Array },
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
        size_bytes: file.bytes.byteLength,
      })
      .select("id,original_name,mime_type,size_bytes,created_at")
      .single();
    if (metadata.error) {
      await supabase.storage.from("knowledge-base").remove([objectPath]);
      throw new Error(`Unable to record file metadata: ${metadata.error.message}`);
    }
    return {
      id: metadata.data.id,
      originalName: metadata.data.original_name,
      mimeType: metadata.data.mime_type,
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
      .select("object_path")
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Unable to load file: ${error.message}`);
    if (!data) throw new ResourceNotFoundError("File");
    const removal = await supabase.storage.from("knowledge-base").remove([data.object_path]);
    if (removal.error) throw new Error(`Unable to delete stored file: ${removal.error.message}`);
    const metadata = await supabase
      .from("knowledge_files")
      .delete()
      .eq("user_id", userId)
      .eq("id", id);
    if (metadata.error) throw new Error(`Unable to delete file metadata: ${metadata.error.message}`);
  }

  async resetForTests(): Promise<void> {
    throw new Error("The production Supabase store cannot be reset from the application.");
  }
}
