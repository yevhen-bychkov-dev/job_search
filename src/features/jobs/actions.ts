"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireIdentity } from "@/features/auth/session";
import { getAppStore } from "@/lib/data/server-store";
import { DuplicateJobError, ResourceNotFoundError } from "@/lib/data/contracts";

import { dateInTimeZone, formDataToRecord, parseJobInput, parseJobStatus } from "./domain";
import type { ActionState } from "./types";

function revalidateJobViews(id?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/jobs");
  revalidatePath("/board");
  if (id) revalidatePath(`/jobs/${id}`);
}

function actionError(error: unknown): ActionState {
  if (error instanceof DuplicateJobError || error instanceof ResourceNotFoundError) {
    return { status: "error", message: error.message };
  }
  return { status: "error", message: "The job could not be saved. Please try again." };
}

export async function createJobAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const identity = await requireIdentity();
  const parsed = parseJobInput(formDataToRecord(formData));
  if (!parsed.ok) return { status: "error", message: "Check the highlighted fields.", errors: parsed.errors };
  let createdId: string;
  try {
    const created = await getAppStore().createJob(identity.userId, parsed.data);
    createdId = created.id;
  } catch (error) {
    return actionError(error);
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
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { status: "error", message: "Invalid job identifier." };
  const parsed = parseJobInput(formDataToRecord(formData));
  if (!parsed.ok) return { status: "error", message: "Check the highlighted fields.", errors: parsed.errors };
  try {
    await getAppStore().updateJob(identity.userId, id, parsed.data);
  } catch (error) {
    return actionError(error);
  }
  revalidateJobViews(id);
  redirect(`/jobs/${id}?updated=1`);
}

export async function changeJobStatusAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const identity = await requireIdentity();
  const id = typeof formData.get("id") === "string" ? String(formData.get("id")) : "";
  const status = parseJobStatus(formData.get("status"));
  const returnToValue = typeof formData.get("returnTo") === "string" ? String(formData.get("returnTo")) : "";
  const returnTo = returnToValue === "/board" || returnToValue === `/jobs/${id}` ? returnToValue : "/board";
  if (!/^[0-9a-f-]{36}$/i.test(id) || !status) {
    return { status: "error", message: "Choose a valid job and status." };
  }
  try {
    await getAppStore().updateJobStatus(identity.userId, id, status, dateInTimeZone());
  } catch (error) {
    return actionError(error);
  }
  revalidateJobViews(id);
  redirect(`${returnTo}?statusUpdated=1`);
}

export async function deleteJobAction(id: string): Promise<void> {
  const identity = await requireIdentity();
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/jobs?error=invalid-id");
  try {
    await getAppStore().deleteJob(identity.userId, id);
  } catch {
    redirect(`/jobs/${id}?error=delete`);
  }
  revalidateJobViews(id);
  redirect("/jobs?deleted=1");
}
