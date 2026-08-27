"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireIdentity } from "@/features/auth/session";
import { getAppStore } from "@/lib/data/server-store";
import {
  ConcurrentModificationError,
  DuplicateJobError,
  ResourceNotFoundError,
} from "@/lib/data/contracts";
import { reportUnexpectedError } from "@/lib/server-errors";
import { isUuid } from "@/lib/validation";

import { dateInTimeZone, formDataToRecord, parseJobInput, parseJobStatus } from "./domain";
import type { ActionState, BulkJobActionState } from "./types";

function revalidateJobViews(id?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/jobs");
  revalidatePath("/archived");
  revalidatePath("/board");
  if (id) revalidatePath(`/jobs/${id}`);
}

function selectedJobIds(formData: FormData): string[] | null {
  const ids = [...new Set(formData.getAll("ids").filter((value): value is string => typeof value === "string"))];
  return ids.length >= 1 && ids.length <= 100 && ids.every(isUuid) ? ids : null;
}

function actionError(error: unknown, values: Record<string, string>): ActionState {
  if (
    error instanceof ConcurrentModificationError
    || error instanceof DuplicateJobError
    || error instanceof ResourceNotFoundError
  ) {
    return { status: "error", message: error.message, values };
  }
  reportUnexpectedError("jobs.mutation", error);
  return {
    status: "error",
    message: "The job could not be saved. Please try again.",
    values,
  };
}

export async function createJobAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const identity = await requireIdentity();
  const values = formDataToRecord(formData);
  const parsed = parseJobInput(values);
  if (!parsed.ok) return { status: "error", message: "Check the highlighted fields.", errors: parsed.errors, values };
  let createdId: string;
  try {
    const created = await getAppStore().createJob(identity.userId, parsed.data);
    createdId = created.id;
  } catch (error) {
    return actionError(error, values);
  }
  revalidateJobViews(createdId);
  redirect(`/jobs/${createdId}?created=1`);
}

export async function updateJobAction(
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const identity = await requireIdentity();
  if (!isUuid(id)) return { status: "error", message: "Invalid job identifier." };
  const values = formDataToRecord(formData);
  const expectedUpdatedAt = formData.get("updatedAt");
  if (
    typeof expectedUpdatedAt !== "string"
    || expectedUpdatedAt.length > 40
    || Number.isNaN(new Date(expectedUpdatedAt).getTime())
  ) {
    return { status: "error", message: "Reload this job before saving changes.", values };
  }
  const parsed = parseJobInput(values);
  if (!parsed.ok) return { status: "error", message: "Check the highlighted fields.", errors: parsed.errors, values };
  try {
    await getAppStore().updateJob(identity.userId, id, parsed.data, expectedUpdatedAt);
  } catch (error) {
    return actionError(error, values);
  }
  revalidateJobViews(id);
  redirect(`/jobs/${id}?updated=1`);
}

export async function changeJobStatusAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const identity = await requireIdentity();
  const values = formDataToRecord(formData);
  const id = typeof formData.get("id") === "string" ? String(formData.get("id")) : "";
  const status = parseJobStatus(formData.get("status"));
  const returnToValue = typeof formData.get("returnTo") === "string" ? String(formData.get("returnTo")) : "";
  const returnTo = returnToValue === "/board" || returnToValue === `/jobs/${id}` ? returnToValue : "/board";
  if (!isUuid(id) || !status) {
    return { status: "error", message: "Choose a valid job and status.", values };
  }
  try {
    await getAppStore().updateJobStatus(identity.userId, id, status, dateInTimeZone());
  } catch (error) {
    return actionError(error, values);
  }
  revalidateJobViews(id);
  redirect(`${returnTo}?statusUpdated=1`);
}

export async function bulkJobsAction(
  _previous: BulkJobActionState,
  formData: FormData,
): Promise<BulkJobActionState> {
  void _previous;
  const identity = await requireIdentity();
  const ids = selectedJobIds(formData);
  const operation = formData.get("operation");
  if (!ids) return { status: "error", message: "Select between 1 and 100 jobs." };
  try {
    if (operation === "status") {
      const status = parseJobStatus(formData.get("status"));
      if (!status) return { status: "error", message: "Choose a valid status." };
      const count = await getAppStore().updateJobsStatus(identity.userId, ids, status, dateInTimeZone());
      revalidateJobViews();
      revalidatePath("/jobs/[id]", "page");
      return { status: "success", message: `${count} ${count === 1 ? "job" : "jobs"} updated.` };
    }
    if (operation === "archive" || operation === "restore") {
      const archived = operation === "archive";
      const count = await getAppStore().setJobsArchived(identity.userId, ids, archived);
      revalidateJobViews();
      revalidatePath("/jobs/[id]", "page");
      return { status: "success", message: `${count} ${count === 1 ? "job" : "jobs"} ${archived ? "archived" : "restored"}.` };
    }
    return { status: "error", message: "Choose a valid bulk action." };
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return { status: "error", message: "One or more selected jobs are no longer available." };
    }
    reportUnexpectedError("jobs.bulk-mutation", error);
    return { status: "error", message: "The selected jobs could not be updated. Please try again." };
  }
}

export async function setJobArchivedAction(id: string, archived: boolean): Promise<void> {
  const identity = await requireIdentity();
  if (!isUuid(id)) redirect("/jobs?error=invalid-id");
  try {
    await getAppStore().setJobsArchived(identity.userId, [id], archived);
  } catch (error) {
    if (!(error instanceof ResourceNotFoundError)) reportUnexpectedError("jobs.archive", error);
    redirect(`/jobs/${id}?error=archive`);
  }
  revalidateJobViews(id);
  redirect(archived ? "/jobs?archived=1" : "/archived?restored=1");
}

export async function deleteJobAction(id: string): Promise<void> {
  const identity = await requireIdentity();
  if (!isUuid(id)) redirect("/jobs?error=invalid-id");
  try {
    await getAppStore().deleteJob(identity.userId, id);
  } catch (error) {
    if (!(error instanceof ResourceNotFoundError)) {
      reportUnexpectedError("jobs.delete", error);
    }
    redirect(`/jobs/${id}?error=delete`);
  }
  revalidateJobViews(id);
  redirect("/jobs?deleted=1");
}
