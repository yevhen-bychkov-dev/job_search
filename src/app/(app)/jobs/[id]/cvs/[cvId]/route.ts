import { requireIdentity } from "@/features/auth/session";
import { ResourceNotFoundError } from "@/lib/data/contracts";
import { getAppStore } from "@/lib/data/server-store";
import { reportUnexpectedError } from "@/lib/server-errors";
import { isUuid } from "@/lib/validation";

export async function GET(request: Request, context: RouteContext<"/jobs/[id]/cvs/[cvId]">) {
  const identity = await requireIdentity();
  const { id, cvId } = await context.params;
  if (!isUuid(id) || !isUuid(cvId)) return new Response("Not found", { status: 404 });
  const downloadRequested = new URL(request.url).searchParams.get("download") === "1";
  try {
    const result = await getAppStore().downloadGeneratedCv(identity.userId, id, cvId, downloadRequested);
    if (result.kind === "redirect") return Response.redirect(result.url, 302);
    return new Response(new Uint8Array(result.bytes).buffer, {
      headers: {
        "content-type": result.mimeType,
        "content-disposition": `${downloadRequested ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    if (!(error instanceof ResourceNotFoundError)) reportUnexpectedError("cvs.download", error);
    return new Response(error instanceof ResourceNotFoundError ? "Not found" : "Unable to open CV", { status: error instanceof ResourceNotFoundError ? 404 : 500 });
  }
}
