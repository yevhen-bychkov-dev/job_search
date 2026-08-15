export type ImportActionState = {
  status: "idle" | "success" | "error";
  message: string;
  summary?: { imported: number; duplicates: number; invalid: number };
};

export const INITIAL_IMPORT_STATE: ImportActionState = { status: "idle", message: "" };
