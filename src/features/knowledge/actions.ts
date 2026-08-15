"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireIdentity } from "@/features/auth/session";
import { getAppStore } from "@/lib/data/server-store";

export async function deleteKnowledgeFileAction(id: string): Promise<void> {
  const identity = await requireIdentity();
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/knowledge-base?error=invalid-id");
  try {
    await getAppStore().deleteKnowledgeFile(identity.userId, id);
  } catch {
    redirect("/knowledge-base?error=delete");
  }
  revalidatePath("/knowledge-base");
  redirect("/knowledge-base?deleted=1");
}
