"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireIdentity } from "@/features/auth/session";
import { getAppStore } from "@/lib/data/server-store";
import { ResourceNotFoundError } from "@/lib/data/contracts";
import { reportUnexpectedError } from "@/lib/server-errors";
import { isUuid } from "@/lib/validation";

export async function deleteKnowledgeFileAction(id: string): Promise<void> {
  const identity = await requireIdentity();
  if (!isUuid(id)) redirect("/knowledge-base?error=invalid-id");
  try {
    await getAppStore().deleteKnowledgeFile(identity.userId, id);
  } catch (error) {
    if (!(error instanceof ResourceNotFoundError)) {
      reportUnexpectedError("knowledge.delete", error);
    }
    redirect("/knowledge-base?error=delete");
  }
  revalidatePath("/knowledge-base");
  redirect("/knowledge-base?deleted=1");
}
