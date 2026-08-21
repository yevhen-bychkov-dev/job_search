import { requireIdentity } from "@/features/auth/session";
import { sanitizeFilename } from "@/features/knowledge/types";
import { validateResumeTemplateBytes, MAX_RESUME_TEMPLATE_BYTES, RESUME_TEMPLATE_MIME_TYPE } from "@/features/cvs/template";
import { getAppStore } from "@/lib/data/server-store";
import { reportUnexpectedError } from "@/lib/server-errors";

export async function POST(request: Request): Promise<Response> {
  const identity = await requireIdentity();
  let file: File | null = null;
  try {
    const formData = await request.formData();
    const candidate = formData.get("file");
    if (candidate instanceof File) file = candidate;
  } catch (error) {
    reportUnexpectedError("resume-template.form-data", error);
    return Response.json({ message: "The template upload could not be read." }, { status: 400 });
  }
  if (!file) return Response.json({ message: "Choose an HTML template." }, { status: 400 });
  const lowerName = file.name.toLocaleLowerCase("en");
  if (!lowerName.endsWith(".html") && !lowerName.endsWith(".htm")) return Response.json({ message: "Upload an .html or .htm template." }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_RESUME_TEMPLATE_BYTES) return Response.json({ message: "HTML templates must be 256 KB or smaller." }, { status: 400 });
  if (file.type && file.type !== RESUME_TEMPLATE_MIME_TYPE && file.type !== "text/plain") return Response.json({ message: "The template must be an HTML file." }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validateResumeTemplateBytes(bytes);
  if (!validation.ok) return Response.json({ message: validation.message }, { status: 400 });
  try {
    await getAppStore().uploadResumeTemplate(identity.userId, { filename: sanitizeFilename(file.name), mimeType: RESUME_TEMPLATE_MIME_TYPE, bytes });
    return Response.json({ message: "Resume template saved." });
  } catch (error) {
    reportUnexpectedError("resume-template.upload", error);
    return Response.json({ message: "The resume template could not be saved." }, { status: 500 });
  }
}
