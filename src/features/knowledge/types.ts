export type KnowledgeFile = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export const KNOWLEDGE_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
] as const;

export const MAX_KNOWLEDGE_FILE_BYTES = 4 * 1024 * 1024;

export function sanitizeFilename(value: string): string {
  const safe = value
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return safe || "document";
}

export function validateKnowledgeFile(file: File): string {
  if (!file.name.trim()) return "Choose a named file.";
  if (file.size <= 0) return "The selected file is empty.";
  if (file.size > MAX_KNOWLEDGE_FILE_BYTES) return "Files must be 4 MB or smaller.";
  if (!KNOWLEDGE_MIME_TYPES.includes(file.type as (typeof KNOWLEDGE_MIME_TYPES)[number])) {
    return "Upload a PDF, DOCX, TXT, Markdown, or CSV file.";
  }
  return "";
}
