"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function ResumeTemplateForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      ref={formRef}
      className="upload-panel"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setMessage(null);
        try {
          const response = await fetch("/api/resume-template", { method: "POST", body: new FormData(event.currentTarget) });
          const result: unknown = await response.json();
          const text = typeof result === "object" && result !== null && "message" in result && typeof result.message === "string" ? result.message : response.ok ? "Resume template saved." : "The template could not be saved.";
          setMessage({ ok: response.ok, text });
          if (response.ok) { formRef.current?.reset(); router.refresh(); }
        } catch {
          setMessage({ ok: false, text: "The template could not be saved. Please try again." });
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="field">
        <label htmlFor="resumeTemplate">Import HTML resume template</label>
        <input id="resumeTemplate" name="file" type="file" required accept=".html,.htm,text/html" />
        <p className="field-help">Use the documented placeholders. Maximum 256 KB; scripts, remote assets, and event handlers are rejected.</p>
      </div>
      <button className="button button-primary" type="submit" disabled={pending}>{pending ? "Saving…" : "Save template"}</button>
      {message ? <p className={`alert alert-${message.ok ? "success" : "error"}`} role={message.ok ? "status" : "alert"}>{message.text}</p> : null}
    </form>
  );
}
