"use server";

import { revalidatePath } from "next/cache";

import { requireIdentity } from "@/features/auth/session";
import { dateInTimeZone } from "@/features/jobs/domain";
import type { JobInput } from "@/features/jobs/types";
import { getAppStore } from "@/lib/data/server-store";
import { reportUnexpectedError } from "@/lib/server-errors";

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

  let duplicates = 0;
  let invalid = 0;
  const jobs: JobInput[] = [];
  for (const row of preview.rows) {
    if (!row.job || Object.keys(row.errors).length > 0) {
      if (row.errors.duplicate) duplicates += 1;
      else invalid += 1;
      continue;
    }
    jobs.push(row.job);
  }

  let imported = 0;
  try {
    const result = await getAppStore().importJobs(identity.userId, jobs);
    imported = result.imported;
    duplicates += result.duplicates;
  } catch (error) {
    reportUnexpectedError("jobs.csv_import", error);
    return {
      status: "error",
      message: "The import could not be completed. No new jobs were saved.",
      summary: { imported: 0, duplicates, invalid },
    };
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
