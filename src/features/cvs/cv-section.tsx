import Link from "next/link";

import { ConfirmSubmitButton } from "@/components/ui/submit-button";
import { formatDateTimeInTimeZone } from "@/features/jobs/domain";

import type { GeneratedCv, JobResumeRequirements, ResumeGeneration } from "./types";
import { deleteGeneratedCvAction } from "./actions";
import { AssessCvForm } from "./assess-cv-form";
import { JobRequirementsEditor } from "./job-requirements-editor";

export function CvSection({ jobId, cvs, sourceUrl, hasCandidateProfile, hasResumeTemplate, latestGeneration, jobRequirements }: { jobId: string; cvs: GeneratedCv[]; sourceUrl: string; hasCandidateProfile: boolean; hasResumeTemplate: boolean; latestGeneration: ResumeGeneration | null; jobRequirements: JobResumeRequirements | null }) {
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
      {latestGeneration?.status === "failed" ? <p className="alert alert-error" role="alert">{latestGeneration.generatedContent
        ? `PDF creation failed (${latestGeneration.errorCode ?? "unknown error"}). Generate again to finish this CV without another Gemini request.`
        : `Gemini did not produce CV content (${latestGeneration.errorCode ?? "unknown error"}). Generate again to make a new Gemini request.`}</p> : null}
      <AssessCvForm jobId={jobId} cvs={cvs} hasSourceUrl={Boolean(sourceUrl)} />
      {cvs.length === 0
        ? <div className="cv-empty"><p>No CVs generated for this job yet.</p></div>
        : <ol className="cv-list">{cvs.map((cv) => <li key={cv.id}>
          <div className="cv-record stack">
            <div className="cv-record-heading"><strong>CV #{cv.version}</strong><span>Generated {formatDateTimeInTimeZone(cv.createdAt)}</span></div>
            {cv.assessment ? <section className="cv-fit-result" aria-label={`CV #${cv.version} fit assessment`}>
              <div className="cv-fit-score"><strong>{cv.assessment.fitScore}/10</strong><span>CV fit</span></div>
              <div className="stack">
                <p>{cv.assessment.summary}</p>
                {cv.assessment.strengths.length ? <div><h4>Strong matches</h4><ul>{cv.assessment.strengths.map((strength) => <li key={strength}>{strength}</li>)}</ul></div> : null}
                {cv.assessment.gaps.length ? <div><h4>Gaps</h4><ul>{cv.assessment.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul></div> : null}
                <p className="cv-fit-meta">Assessed {formatDateTimeInTimeZone(cv.assessment.assessedAt)} · <a href={cv.assessment.sourceUrl} target="_blank" rel="noreferrer">source snapshot ↗</a></p>
              </div>
            </section> : null}
          </div>
          <div className="file-actions">
            <a className="button button-secondary button-small" href={`/jobs/${jobId}/cvs/${cv.id}`} target="_blank" rel="noreferrer">Preview</a>
            <a className="button button-secondary button-small" href={`/jobs/${jobId}/cvs/${cv.id}?download=1`}>Download</a>
            <form action={deleteGeneratedCvAction.bind(null, jobId, cv.id)}><ConfirmSubmitButton confirmation={`Remove CV #${cv.version}? Its number will not be reused.`}>Remove</ConfirmSubmitButton></form>
          </div>
        </li>)}</ol>}
    </article>
  );
}
