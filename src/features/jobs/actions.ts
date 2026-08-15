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
import type { ActionState } from "./types";

function revalidateJobViews(id?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/jobs");
  revalidatePath("/board");
  if (id) revalidatePath(`/jobs/${id}`);
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
