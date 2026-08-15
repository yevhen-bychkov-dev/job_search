import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import { ConfirmSubmitButton } from "@/components/ui/submit-button";
import { requireIdentity } from "@/features/auth/session";
import { deleteKnowledgeFileAction } from "@/features/knowledge/actions";
import { KnowledgeUploadForm } from "@/features/knowledge/knowledge-upload-form";
import { getAppStore } from "@/lib/data/server-store";

export const metadata: Metadata = { title: "Knowledge Base" };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function KnowledgeBasePage({ searchParams }: PageProps<"/knowledge-base">) {
  const identity = await requireIdentity();
  const query = await searchParams;
  const files = await getAppStore().listKnowledgeFiles(identity.userId);
  return (
    <div className="page-stack">
      <PageHeader eyebrow="Documents" title="Knowledge Base" description="Keep resumes, notes, and supporting files private and ready for future workflows." />
      {query.deleted === "1" ? <p className="alert alert-success" role="status">File deleted.</p> : null}
      {query.error ? <p className="alert alert-error" role="alert">The file could not be deleted. Please try again.</p> : null}
      <KnowledgeUploadForm />
      <section className="card stack" aria-labelledby="files-heading"><div className="section-heading"><div><p className="eyebrow">Private storage</p><h2 id="files-heading">Uploaded files</h2></div><span className="count-pill">{files.length}</span></div>
        {files.length === 0 ? <div className="empty-state compact"><span className="empty-icon">▱</span><h3>No files uploaded</h3><p>Your private documents will appear here.</p></div> : <div className="file-list">{files.map((file) => { const deleteAction = deleteKnowledgeFileAction.bind(null, file.id); return <article className="file-row" key={file.id}><span className="file-icon" aria-hidden="true">DOC</span><div><strong>{file.originalName}</strong><span>{formatBytes(file.sizeBytes)} · {new Date(file.createdAt).toLocaleDateString("en-GB")}</span></div><div className="file-actions"><a className="button button-secondary button-small" href={`/knowledge-base/files/${file.id}`} target="_blank">Open</a><form action={deleteAction}><ConfirmSubmitButton confirmation={`Delete ${file.originalName}?`}>Delete</ConfirmSubmitButton></form></div></article>; })}</div>}
      </section>
    </div>
  );
}
