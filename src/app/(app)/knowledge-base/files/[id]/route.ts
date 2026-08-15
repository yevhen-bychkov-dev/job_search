import { requireIdentity } from "@/features/auth/session";
import { ResourceNotFoundError } from "@/lib/data/contracts";
import { getAppStore } from "@/lib/data/server-store";
import { reportUnexpectedError } from "@/lib/server-errors";
import { isUuid } from "@/lib/validation";

export async function GET(_request: Request, context: RouteContext<"/knowledge-base/files/[id]">) {
  const identity = await requireIdentity();
  const { id } = await context.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  try {
    const download = await getAppStore().downloadKnowledgeFile(identity.userId, id);
    if (download.kind === "redirect") return Response.redirect(download.url, 302);
    return new Response(new Uint8Array(download.bytes).buffer, {
      headers: {
        "content-type": download.mimeType,
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(download.filename)}`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    if (!(error instanceof ResourceNotFoundError)) {
      reportUnexpectedError("knowledge.download", error);
    }
    return new Response(error instanceof ResourceNotFoundError ? "Not found" : "Unable to open file", { status: error instanceof ResourceNotFoundError ? 404 : 500 });
  }
}
