"use server";

import { revalidatePath } from "next/cache";

import { requireIdentity } from "@/features/auth/session";
import type { ActionState } from "@/features/jobs/types";
import { getAppStore } from "@/lib/data/server-store";
import { reportUnexpectedError } from "@/lib/server-errors";

import { parseFilterSettings } from "./domain";

export async function saveFiltersAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const identity = await requireIdentity();
  const values = {
    includedTechnologies: formData.get("includedTechnologies"),
    excludedTechnologies: formData.get("excludedTechnologies"),
    preferredTitles: formData.get("preferredTitles"),
  };
  const submittedValues = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 12_000) : ""]),
  );
  const parsed = parseFilterSettings(values);
  if (!parsed.ok) return { status: "error", message: "Check the highlighted fields.", errors: parsed.errors, values: submittedValues };
  try {
    await getAppStore().saveFilters(identity.userId, parsed.data);
    revalidatePath("/filters");
    return { status: "success", message: "Filters saved." };
  } catch (error) {
    reportUnexpectedError("filters.save", error);
    return { status: "error", message: "Filters could not be saved. Please try again.", values: submittedValues };
  }
}
