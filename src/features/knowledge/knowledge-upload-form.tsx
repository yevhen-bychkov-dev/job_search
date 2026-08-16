"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { KnowledgeDocumentKind } from "./types";

export function KnowledgeUploadForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [documentKind, setDocumentKind] = useState<KnowledgeDocumentKind>("reference");
  const [feedback, setFeedback] = useState<{ status: "success" | "error"; message: string } | null>(null);

  return (
    <form
      ref={formRef}
      className="upload-panel"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setFeedback(null);
        try {
          const response = await fetch("/api/knowledge-files", {
            method: "POST",
            body: new FormData(event.currentTarget),
          });
          const result: unknown = await response.json();
          const message =
            typeof result === "object" && result !== null && "message" in result && typeof result.message === "string"
              ? result.message
              : response.ok
                ? "File uploaded."
                : "The file could not be uploaded.";
          setFeedback({ status: response.ok ? "success" : "error", message });
          if (response.ok) {
            formRef.current?.reset();
            router.refresh();
          }
        } catch {
          setFeedback({ status: "error", message: "The file could not be uploaded. Please try again." });
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="field upload-kind-field">
        <label htmlFor="documentKind">Document type</label>
        <select id="documentKind" name="documentKind" value={documentKind} onChange={(event) => setDocumentKind(event.target.value as KnowledgeDocumentKind)}>
          <option value="reference">Supporting document</option>
          <option value="candidate_profile">Candidate profile</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="knowledgeFile">Add a document</label>
        <input id="knowledgeFile" name="file" type="file" required accept={documentKind === "candidate_profile" ? ".json,application/json" : ".pdf,.docx,.txt,.md,.csv,.json,application/pdf,text/plain,text/markdown,text/csv,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document"} />
        <p className="field-help">{documentKind === "candidate_profile" ? "Strict structured JSON. The newest valid profile is used for CV generation." : "PDF, DOCX, TXT, Markdown, CSV, or JSON. Maximum 4 MB."}</p>
      </div>
      <button className="button button-primary" type="submit" disabled={pending}>{pending ? "Uploading…" : "Upload file"}</button>
      {feedback ? <p className={`alert alert-${feedback.status}`} role={feedback.status === "error" ? "alert" : "status"}>{feedback.message}</p> : null}
    </form>
  );
}
