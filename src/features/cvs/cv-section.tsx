import Link from "next/link";

import { formatDateTimeInTimeZone } from "@/features/jobs/domain";

import type { GeneratedCv, JobResumeRequirements, ResumeGeneration } from "./types";
import { JobRequirementsEditor } from "./job-requirements-editor";

export function CvSection({ jobId, cvs, hasCandidateProfile, hasResumeTemplate, latestGeneration, jobRequirements }: { jobId: string; cvs: GeneratedCv[]; hasCandidateProfile: boolean; hasResumeTemplate: boolean; latestGeneration: ResumeGeneration | null; jobRequirements: JobResumeRequirements | null }) {
  return (
    <article className="card stack" aria-labelledby="cvs-heading">
      <div className="section-heading">
        <div><p className="eyebrow">Tailored documents</p><h2 id="cvs-heading">CVs</h2></div>
        <span className="count-pill">{cvs.length}</span>
      </div>
      {!hasResumeTemplate ? <div className="alert alert-error" role="alert">Configure an HTML Resume Template in <Link href="/account">Account</Link> before generating a resume.</div> : null}
      {hasCandidateProfile ? <JobRequirementsEditor jobId={jobId} initialAnalysis={jobRequirements?.analysis ?? null} initialRequirements={jobRequirements?.requirements ?? []} initialApprovedAt={jobRequirements?.approvedAt ?? null} canAnalyze={hasCandidateProfile} hasResumeTemplate={hasResumeTemplate} /> : null}
      {hasCandidateProfile && !jobRequirements?.requirements.length ? <p className="alert alert-info" role="status">Analyze and approve vacancy skills before generating a resume.</p> : null}
      {!hasCandidateProfile ? <div className="alert alert-error" role="alert">Add a validated Candidate Profile JSON in the <Link href="/knowledge-base">Knowledge Base</Link> before generating a resume.</div> : null}
      {latestGeneration && !["completed", "failed", "rate_limited", "cancelled"].includes(latestGeneration.status) && latestGeneration.leaseExpiresAt ? <p className="alert alert-info" role="status">The {latestGeneration.currentStage ?? "generation"} stage is running. Its lease expires automatically if the request is interrupted.</p> : null}
      {latestGeneration?.status === "rate_limited" ? <p className="alert alert-error" role="alert">Gemini rate-limited the content stage. The request was not amplified; retry after the provider limit resets.</p> : null}
      {latestGeneration?.status === "failed" ? <p className="alert alert-error" role="alert">The last attempt failed during {latestGeneration.currentStage ?? "generation"} ({latestGeneration.errorCode ?? "unknown error"}). Completed content is preserved, so rendering can be retried without another AI call.</p> : null}
      {cvs.length === 0
        ? <div className="cv-empty"><p>No CVs generated for this job yet.</p></div>
        : <ol className="cv-list">{cvs.map((cv) => <li key={cv.id}><div><strong>CV #{cv.version}</strong><span>Generated {formatDateTimeInTimeZone(cv.createdAt)}</span></div><div className="file-actions"><a className="button button-secondary button-small" href={`/jobs/${jobId}/cvs/${cv.id}`} target="_blank" rel="noreferrer">Preview</a><a className="button button-secondary button-small" href={`/jobs/${jobId}/cvs/${cv.id}?download=1`}>Download</a></div></li>)}</ol>}
    </article>
  );
}
