import Link from "next/link";

import { ConfirmSubmitButton } from "@/components/ui/submit-button";
import { formatDateTimeInTimeZone } from "@/features/jobs/domain";

import { deleteGeneratedCoverLetterAction } from "./actions";
import { generatedCoverLetterFilename } from "./domain";
import { GenerateCoverLetterForm } from "./generate-cover-letter-form";
import type { GeneratedCoverLetter } from "./types";

export function CoverLetterSection({ jobId, companyName, candidateName, coverLetters, hasCandidateProfile, hasVacancyDescription }: { jobId: string; companyName: string; candidateName: string; coverLetters: GeneratedCoverLetter[]; hasCandidateProfile: boolean; hasVacancyDescription: boolean }) {
  const filename = generatedCoverLetterFilename(candidateName, companyName);
  const canGenerate = hasCandidateProfile && hasVacancyDescription;
  const disabledReason = !hasCandidateProfile
    ? "Add a validated Candidate Profile JSON in the Knowledge Base first."
    : !hasVacancyDescription ? "Add the vacancy description to this job first." : undefined;
  return <article className="card stack" aria-labelledby="cover-letters-heading">
    <div className="section-heading">
      <div><p className="eyebrow">Tailored documents</p><h2 id="cover-letters-heading">Cover letters</h2></div>
      <span className="count-pill">{coverLetters.length}</span>
    </div>
    {!hasCandidateProfile ? <div className="alert alert-error" role="alert">Add a validated Candidate Profile JSON in the <Link href="/knowledge-base">Knowledge Base</Link> before creating a cover letter.</div> : null}
    {!hasVacancyDescription ? <div className="alert alert-error" role="alert">Add the vacancy description before creating a cover letter.</div> : null}
    <GenerateCoverLetterForm jobId={jobId} canGenerate={canGenerate} disabledReason={disabledReason} />
    {coverLetters.length === 0 ? <div className="cv-empty"><p>No cover letters generated for this job yet.</p></div> : <ol className="cv-list">
      {coverLetters.map((letter) => <li key={letter.id}>
        <div className="cv-record stack"><div className="cv-record-heading"><strong>{filename}</strong><span>Version {letter.version} · Generated {formatDateTimeInTimeZone(letter.createdAt)}</span></div></div>
        <div className="file-actions">
          <a className="button button-secondary button-small" href={`/jobs/${jobId}/cover-letters/${letter.id}`} target="_blank" rel="noreferrer">Preview cover letter</a>
          <a className="button button-secondary button-small" href={`/jobs/${jobId}/cover-letters/${letter.id}?download=1`}>Download cover letter</a>
          <form action={deleteGeneratedCoverLetterAction.bind(null, jobId, letter.id)}><ConfirmSubmitButton confirmation={`Remove cover letter #${letter.version}? Its number will not be reused.`}>Remove cover letter</ConfirmSubmitButton></form>
        </div>
      </li>)}
    </ol>}
  </article>;
}
