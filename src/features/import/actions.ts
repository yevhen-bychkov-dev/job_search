"use server";

import { revalidatePath } from "next/cache";

import { requireIdentity } from "@/features/auth/session";
import { dateInTimeZone } from "@/features/jobs/domain";
import { DuplicateJobError } from "@/lib/data/contracts";
import { getAppStore } from "@/lib/data/server-store";

import { previewCsv } from "./csv";
import type { ImportActionState } from "./types";

export async function importCsvAction(
  _previous: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const identity = await requireIdentity();
  const csv = typeof formData.get("csv") === "string" ? String(formData.get("csv")) : "";
  const preview = previewCsv(csv, dateInTimeZone());
  if (preview.fatalError || preview.rows.length === 0) {
    return { status: "error", message: preview.fatalError || "No data rows were found." };
  }

  const store = getAppStore();
  let imported = 0;
  let duplicates = 0;
  let invalid = 0;
  for (const row of preview.rows) {
    if (!row.job || Object.keys(row.errors).length > 0) {
      if (row.errors.duplicate) duplicates += 1;
      else invalid += 1;
      continue;
    }
    try {
      if (await store.hasDuplicate(identity.userId, row.duplicateKey)) {
        duplicates += 1;
        continue;
      }
      await store.createJob(identity.userId, row.job);
      imported += 1;
    } catch (error) {
      if (error instanceof DuplicateJobError) duplicates += 1;
      else invalid += 1;
    }
  }

  revalidatePath("/jobs");
  revalidatePath("/board");
  revalidatePath("/dashboard");
  return {
    status: imported > 0 ? "success" : "error",
    message: imported > 0 ? "Import complete." : "No new jobs were imported.",
    summary: { imported, duplicates, invalid },
  };
}
