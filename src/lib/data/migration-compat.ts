import type { SavedJobRequirement } from "@/features/cvs/types";

export function isMissingColumnError(error: { code?: string; message?: string } | null, column: string): boolean {
  if (!error || !(error.message ?? "").includes(column)) return false;
  return ["42703", "PGRST204"].includes(error.code ?? "") || (error.message ?? "").includes("does not exist");
}

export function inferLegacyRequirementsApproval(requirements: SavedJobRequirement[], updatedAt: string): string | null {
  return requirements.length > 0 && requirements.every((requirement) => requirement.level !== "unconfirmed") ? updatedAt : null;
}
