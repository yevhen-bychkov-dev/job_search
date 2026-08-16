export type KnowledgeFile = {
  id: string;
  originalName: string;
  mimeType: string;
  documentKind: KnowledgeDocumentKind;
  sizeBytes: number;
  createdAt: string;
};

export const KNOWLEDGE_DOCUMENT_KINDS = ["reference", "candidate_profile"] as const;
export type KnowledgeDocumentKind = (typeof KNOWLEDGE_DOCUMENT_KINDS)[number];

export const KNOWLEDGE_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
] as const;

export const MAX_KNOWLEDGE_FILE_BYTES = 4 * 1024 * 1024;

const MIME_BY_EXTENSION = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".json": "application/json",
} as const;

export function sanitizeFilename(value: string): string {
  const safe = value
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return safe || "document";
}

function filenameExtension(filename: string): keyof typeof MIME_BY_EXTENSION | "" {
  const normalized = filename.toLocaleLowerCase("en");
  return (Object.keys(MIME_BY_EXTENSION) as Array<keyof typeof MIME_BY_EXTENSION>).find((extension) =>
    normalized.endsWith(extension),
  ) ?? "";
}

export function validateKnowledgeFileMetadata(file: File): string {
  if (!file.name.trim()) return "Choose a named file.";
  if (file.size <= 0) return "The selected file is empty.";
  if (file.size > MAX_KNOWLEDGE_FILE_BYTES) return "Files must be 4 MB or smaller.";
  if (!KNOWLEDGE_MIME_TYPES.includes(file.type as (typeof KNOWLEDGE_MIME_TYPES)[number])) {
    return "Upload a PDF, DOCX, TXT, Markdown, CSV, or JSON file.";
  }
  const extension = filenameExtension(file.name);
  if (!extension || MIME_BY_EXTENSION[extension] !== file.type) {
    return "The filename extension does not match the selected file type.";
  }
  return "";
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function isPdf(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.byteLength - 4, 1024);
  for (let index = 0; index <= limit; index += 1) {
    if (startsWith(bytes.subarray(index), [0x25, 0x50, 0x44, 0x46, 0x2d])) return true;
  }
  return false;
}

function isDocx(bytes: Uint8Array): boolean {
  if (!startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return false;
  const directoryText = new TextDecoder("latin1").decode(bytes);
  return directoryText.includes("[Content_Types].xml") && directoryText.includes("word/");
}

function isUtf8Text(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

export function validateKnowledgeFileContent(
  mimeType: string,
  bytes: Uint8Array,
): string {
  const valid = mimeType === "application/pdf"
    ? isPdf(bytes)
    : mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ? isDocx(bytes)
      : ["text/plain", "text/markdown", "text/csv", "application/json"].includes(mimeType)
        ? isUtf8Text(bytes)
        : false;
  return valid ? "" : "The file contents do not match the selected file type.";
}

export async function validateKnowledgeFile(file: File): Promise<string> {
  const metadataError = validateKnowledgeFileMetadata(file);
  if (metadataError) return metadataError;
  return validateKnowledgeFileContent(file.type, new Uint8Array(await file.arrayBuffer()));
}
