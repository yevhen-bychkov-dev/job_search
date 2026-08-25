export type GeneratedCvContent = {
  headline: string | null;
  summary: string | null;
  skills: string[];
  experience: Array<{
    company: string;
    role: string;
    startDate: string | null;
    endDate: string | null;
    technologies: string[];
    achievements: string[];
  }>;
  education: Array<{
    institution: string;
    degree: string | null;
    startDate: string | null;
    endDate: string | null;
  }>;
};

export type ResumeAiStage = "generation" | "render";

export type GeneratedCv = {
  id: string;
  jobId: string;
  version: number;
  content: GeneratedCvContent;
  aiProvider: string;
  aiModel: string;
  generationId: string | null;
  templateVersion: number | null;
  createdAt: string;
};

// Legacy statuses remain readable because existing rows may contain them. New
// work uses only analyzing, generating, rendering, completed, failed,
// rate_limited, and cancelled.
export const RESUME_GENERATION_STATUSES = [
  "analyzing",
  "awaiting_confirmation",
  "strategizing",
  "generating",
  "critiquing",
  "correcting",
  "rendering",
  "retrying",
  "rate_limited",
  "completed",
  "failed",
  "cancelled",
] as const;
export type ResumeGenerationStatus = (typeof RESUME_GENERATION_STATUSES)[number];

export const RESUME_CONFIRMATION_LEVELS = ["commercial", "familiar", "none"] as const;
export type ResumeConfirmationLevel = (typeof RESUME_CONFIRMATION_LEVELS)[number];
export const JOB_REQUIREMENT_LEVELS = ["unconfirmed", ...RESUME_CONFIRMATION_LEVELS] as const;
export type JobRequirementLevel = (typeof JOB_REQUIREMENT_LEVELS)[number];

export type VacancyRequirement = {
  key: string;
  label: string;
  category: "technical" | "tooling" | "architecture" | "domain" | "responsibility" | "ownership" | "collaboration" | "leadership";
  importance: "must_have" | "nice_to_have";
  status: "supported" | "unconfirmed" | "confirmed_familiar" | "confirmed_none";
  evidence: string[];
};

export type VacancyAnalysis = {
  mustHaveTechnical: VacancyRequirement[];
  niceToHaveTechnical: VacancyRequirement[];
  tooling: VacancyRequirement[];
  architecture: VacancyRequirement[];
  domainKnowledge: VacancyRequirement[];
  responsibilities: VacancyRequirement[];
  ownershipExpectations: VacancyRequirement[];
  senioritySignals: string[];
  collaborationExpectations: VacancyRequirement[];
  leadershipExpectations: VacancyRequirement[];
  atsKeywords: string[];
  employerTerminology: string[];
};

export type ApprovedResumeSkill = {
  key: string;
  label: string;
  level: ResumeConfirmationLevel;
  provenance: "existing_kb" | "explicit_user_confirmation";
};

// Kept as an alias for stored database JSON created by earlier revisions.
export type ResumeConfirmation = ApprovedResumeSkill;

export const VACANCY_REQUIREMENT_SECTIONS = [
  "mustHaveTechnical",
  "niceToHaveTechnical",
  "tooling",
  "architecture",
  "domainKnowledge",
  "responsibilities",
  "ownershipExpectations",
  "collaborationExpectations",
  "leadershipExpectations",
] as const;
export type VacancyRequirementSection = (typeof VACANCY_REQUIREMENT_SECTIONS)[number];

export type SavedJobRequirement = VacancyRequirement & {
  section: VacancyRequirementSection;
  level: JobRequirementLevel;
  source: "ai" | "user";
};

export type JobResumeRequirements = {
  analysis: VacancyAnalysis;
  requirements: SavedJobRequirement[];
  updatedAt: string;
  approvedAt: string | null;
};

export type ResumeGeneration = {
  id: string;
  jobId: string;
  status: ResumeGenerationStatus;
  idempotencyKey: string;
  analysis: VacancyAnalysis | null;
  approvedSkills: ApprovedResumeSkill[];
  generatedContent: GeneratedCvContent | null;
  currentStage: ResumeAiStage | null;
  attemptCount: number;
  nextRetryAt: string | null;
  leaseExpiresAt: string | null;
  errorCode: string | null;
  templateVersion: number | null;
  aiProvider: string | null;
  aiModel: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CvActionState = {
  status: "idle" | "in_progress" | "success" | "error";
  message: string;
  generationId?: string;
  stage?: ResumeAiStage;
};

export type RequirementsActionState = {
  status: "idle" | "success" | "error";
  message: string;
  requirements?: SavedJobRequirement[];
  analysis?: VacancyAnalysis;
  approvedAt?: string | null;
};

export const INITIAL_CV_ACTION_STATE: CvActionState = { status: "idle", message: "" };
export const INITIAL_REQUIREMENTS_ACTION_STATE: RequirementsActionState = { status: "idle", message: "" };
