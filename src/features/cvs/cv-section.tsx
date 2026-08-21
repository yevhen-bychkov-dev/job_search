import Link from "next/link";

import { formatDateTimeInTimeZone } from "@/features/jobs/domain";

import type { GeneratedCv, ResumeGeneration } from "./types";
import { GenerateCvForm } from "./generate-cv-form";

export function CvSection({ jobId, cvs, hasCandidateProfile, hasResumeTemplate, latestGeneration }: { jobId: string; cvs: GeneratedCv[]; hasCandidateProfile: boolean; hasResumeTemplate: boolean; latestGeneration: ResumeGeneration | null }) {
  return (
    <article className="card stack" aria-labelledby="cvs-heading">
      <div className="section-heading">
        <div><p className="eyebrow">Tailored documents</p><h2 id="cvs-heading">CVs</h2></div>
        <span className="count-pill">{cvs.length}</span>
      </div>
      {!hasResumeTemplate ? <div className="alert alert-error" role="alert">Configure an HTML Resume Template in <Link href="/account">Account</Link> before generating a resume.</div> : null}
      {hasResumeTemplate && hasCandidateProfile ? <GenerateCvForm jobId={jobId} /> : null}
      {!hasCandidateProfile ? <div className="alert alert-error" role="alert">Add a validated Candidate Profile JSON in the <Link href="/knowledge-base">Knowledge Base</Link> before generating a resume.</div> : null}
      {latestGeneration && latestGeneration.status !== "completed" && latestGeneration.status !== "failed" && latestGeneration.status !== "cancelled" ? <p className="alert alert-info" role="status">Resume generation is {latestGeneration.status.replaceAll("_", " ")}. You can leave this page; completed resumes will appear here when you return.</p> : null}
      {latestGeneration?.status === "failed" ? <p className="alert alert-error" role="alert">The last resume generation failed. You can retry after correcting the issue.</p> : null}
      {cvs.length === 0
        ? <div className="cv-empty"><p>No CVs generated for this job yet.</p></div>
        : <ol className="cv-list">{cvs.map((cv) => <li key={cv.id}><div><strong>CV #{cv.version}</strong><span>Generated {formatDateTimeInTimeZone(cv.createdAt)}</span></div><div className="file-actions"><a className="button button-secondary button-small" href={`/jobs/${jobId}/cvs/${cv.id}`} target="_blank" rel="noreferrer">Preview</a><a className="button button-secondary button-small" href={`/jobs/${jobId}/cvs/${cv.id}?download=1`}>Download</a></div></li>)}</ol>}
    </article>
  );
}
