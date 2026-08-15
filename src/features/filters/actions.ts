"use server";

import { revalidatePath } from "next/cache";

import { requireIdentity } from "@/features/auth/session";
import type { ActionState } from "@/features/jobs/types";
import { getAppStore } from "@/lib/data/server-store";

import { parseFilterSettings } from "./domain";

export async function saveFiltersAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const identity = await requireIdentity();
  const parsed = parseFilterSettings({
    includedTechnologies: formData.get("includedTechnologies"),
    excludedTechnologies: formData.get("excludedTechnologies"),
    preferredTitles: formData.get("preferredTitles"),
  });
  if (!parsed.ok) return { status: "error", message: "Check the highlighted fields.", errors: parsed.errors };
  try {
    await getAppStore().saveFilters(identity.userId, parsed.data);
    revalidatePath("/filters");
    return { status: "success", message: "Filters saved." };
  } catch {
    return { status: "error", message: "Filters could not be saved. Please try again." };
  }
}
