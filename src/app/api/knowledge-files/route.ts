import { getOptionalIdentity } from "@/features/auth/session";
import { MAX_KNOWLEDGE_FILE_BYTES, sanitizeFilename, validateKnowledgeFile } from "@/features/knowledge/types";
import { getAppStore } from "@/lib/data/server-store";

export async function POST(request: Request) {
  const identity = await getOptionalIdentity();
  if (!identity) return Response.json({ message: "Authentication required." }, { status: 401 });
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_KNOWLEDGE_FILE_BYTES + 200_000) {
    return Response.json({ message: "Files must be 4 MB or smaller." }, { status: 413 });
  }
  try {
    const formData = await request.formData();
    const candidate = formData.get("file");
    if (!(candidate instanceof File)) {
      return Response.json({ message: "Choose a file to upload." }, { status: 400 });
    }
    const validationError = validateKnowledgeFile(candidate);
    if (validationError) return Response.json({ message: validationError }, { status: 400 });
    await getAppStore().uploadKnowledgeFile(identity.userId, {
      filename: sanitizeFilename(candidate.name),
      mimeType: candidate.type,
      bytes: new Uint8Array(await candidate.arrayBuffer()),
    });
    return Response.json({ message: "File uploaded." }, { status: 201 });
  } catch {
    return Response.json({ message: "The file could not be uploaded. Please try again." }, { status: 500 });
  }
}
