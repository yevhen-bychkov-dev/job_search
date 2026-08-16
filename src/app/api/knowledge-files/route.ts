import { getOptionalIdentity } from "@/features/auth/session";
import {
  KNOWLEDGE_DOCUMENT_KINDS,
  MAX_KNOWLEDGE_FILE_BYTES,
  sanitizeFilename,
  validateKnowledgeFileContent,
  validateKnowledgeFileMetadata,
} from "@/features/knowledge/types";
import { parseCandidateProfileBytes } from "@/features/knowledge/candidate-profile";
import { getAppStore } from "@/lib/data/server-store";
import { reportUnexpectedError } from "@/lib/server-errors";

export async function POST(request: Request) {
  const identity = await getOptionalIdentity();
  if (!identity) return Response.json({ message: "Authentication required." }, { status: 401 });
  const contentLengthHeader = request.headers.get("content-length");
  if (!contentLengthHeader || !/^\d+$/.test(contentLengthHeader)) {
    return Response.json({ message: "A valid Content-Length header is required." }, { status: 411 });
  }
  const contentLength = Number(contentLengthHeader);
  if (contentLength > MAX_KNOWLEDGE_FILE_BYTES + 200_000) {
    return Response.json({ message: "Files must be 4 MB or smaller." }, { status: 413 });
  }
  try {
    const formData = await request.formData();
    const candidate = formData.get("file");
    const documentKindValue = formData.get("documentKind");
    const documentKind = typeof documentKindValue === "string"
      && KNOWLEDGE_DOCUMENT_KINDS.includes(documentKindValue as (typeof KNOWLEDGE_DOCUMENT_KINDS)[number])
      ? documentKindValue as (typeof KNOWLEDGE_DOCUMENT_KINDS)[number]
      : null;
    if (!documentKind) return Response.json({ message: "Choose a valid document type." }, { status: 400 });
    if (!(candidate instanceof File)) {
      return Response.json({ message: "Choose a file to upload." }, { status: 400 });
    }
    const metadataError = validateKnowledgeFileMetadata(candidate);
    if (metadataError) return Response.json({ message: metadataError }, { status: 400 });
    const bytes = new Uint8Array(await candidate.arrayBuffer());
    const contentError = validateKnowledgeFileContent(candidate.type, bytes);
    if (contentError) return Response.json({ message: contentError }, { status: 400 });
    if (documentKind === "candidate_profile") {
      if (candidate.type !== "application/json") {
        return Response.json({ message: "Candidate profiles must be uploaded as JSON." }, { status: 400 });
      }
      const profile = parseCandidateProfileBytes(bytes);
      if (!profile.ok) return Response.json({ message: profile.message }, { status: 400 });
    }
    await getAppStore().uploadKnowledgeFile(identity.userId, {
      filename: sanitizeFilename(candidate.name),
      mimeType: candidate.type,
      documentKind,
      bytes,
    });
    return Response.json({ message: "File uploaded." }, { status: 201 });
  } catch (error) {
    reportUnexpectedError("knowledge.upload", error);
    return Response.json({ message: "The file could not be uploaded. Please try again." }, { status: 500 });
  }
}
