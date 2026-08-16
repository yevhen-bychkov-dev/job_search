import Link from "next/link";

import { formatDateTimeInTimeZone } from "@/features/jobs/domain";

import type { GeneratedCv } from "./types";
import { GenerateCvForm } from "./generate-cv-form";

export function CvSection({ jobId, cvs, hasCandidateProfile }: { jobId: string; cvs: GeneratedCv[]; hasCandidateProfile: boolean }) {
  return (
    <article className="card stack" aria-labelledby="cvs-heading">
      <div className="section-heading">
        <div><p className="eyebrow">Tailored documents</p><h2 id="cvs-heading">CVs</h2></div>
        <span className="count-pill">{cvs.length}</span>
      </div>
      {hasCandidateProfile
        ? <GenerateCvForm jobId={jobId} />
        : <div className="alert alert-error" role="alert">Add a validated Candidate Profile JSON in the <Link href="/knowledge-base">Knowledge Base</Link> before generating a CV.</div>}
      {cvs.length === 0
        ? <div className="cv-empty"><p>No CVs generated for this job yet.</p></div>
        : <ol className="cv-list">{cvs.map((cv) => <li key={cv.id}><div><strong>CV #{cv.version}</strong><span>Generated {formatDateTimeInTimeZone(cv.createdAt)}</span></div><div className="file-actions"><a className="button button-secondary button-small" href={`/jobs/${jobId}/cvs/${cv.id}`} target="_blank" rel="noreferrer">Preview</a><a className="button button-secondary button-small" href={`/jobs/${jobId}/cvs/${cv.id}?download=1`}>Download</a></div></li>)}</ol>}
    </article>
  );
}
