import type { CandidateProfile } from "@/features/knowledge/candidate-profile";

export type CvSelection = {
  includeSummary: boolean;
  skillOrder: string[];
  experience: Array<{ experienceId: string; achievementIds: string[] }>;
  educationIds: string[];
};

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

export type ResumeAiStage = "analysis" | "strategy" | "generation" | "critique" | "correction" | "render";

export type ResumeStrategy = {
  targetPositioning: string;
  topHiringSignals: Array<{ signal: string; priority: "high" | "medium" | "low" }>;
  evidenceToSurface: Array<{ factId?: string; description: string; supports: string[] }>;
  skillsToPrioritize: string[];
  skillsToInclude: string[];
  experienceThemes: string[];
  seniorityNarrative: string[];
  terminologyToUse: string[];
  itemsToDeEmphasize: string[];
  unsupportedRequirements: string[];
  summaryDirection: string;
  experienceDirections: Array<{ company?: string; goals: string[] }>;
};

export type ResumeCritiqueProblem = {
  type: "missing_requirement" | "weak_seniority" | "generic_summary" | "master_resume_similarity" | "missing_skill" | "poor_prioritization" | "unsupported_claim" | "keyword_stuffing" | "weak_bullet" | "other";
  severity: "high" | "medium" | "low";
  description: string;
  suggestedFix?: string;
};

export type ResumeCritique = {
  score: number;
  passes: boolean;
  problems: ResumeCritiqueProblem[];
  missingSupportedRequirements: string[];
  unsupportedClaims: string[];
  strengths: string[];
};

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
  category: "technical" | "tooling" | "architecture" | "domain" | "responsibility" | "collaboration" | "leadership";
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

export type ResumeConfirmation = {
  key: string;
  label: string;
  level: ResumeConfirmationLevel;
  provenance: "existing_kb" | "explicit_user_confirmation";
};

export type ResumeConfirmationQuestion = {
  key: string;
  label: string;
  category: VacancyRequirement["category"];
  importance: VacancyRequirement["importance"];
};

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
};

export type ResumeGeneration = {
  id: string;
  jobId: string;
  status: ResumeGenerationStatus;
  idempotencyKey: string;
  analysis: VacancyAnalysis | null;
  confirmations: ResumeConfirmation[];
  strategy: ResumeStrategy | null;
  generatedContent: GeneratedCvContent | null;
  critique: ResumeCritique | null;
  correction: GeneratedCvContent | null;
  currentStage: ResumeAiStage | null;
  attemptCount: number;
  nextRetryAt: string | null;
  errorCode: string | null;
  templateVersion: number | null;
  createdAt: string;
  updatedAt: string;
};

export type CvActionState = {
  status: "idle" | "confirmation" | "success" | "error";
  message: string;
  generationId?: string;
  questions?: ResumeConfirmationQuestion[];
};

export type RequirementsActionState = {
  status: "idle" | "success" | "error";
  message: string;
  requirements?: SavedJobRequirement[];
  analysis?: VacancyAnalysis;
};

export const INITIAL_CV_ACTION_STATE: CvActionState = { status: "idle", message: "" };
export const INITIAL_REQUIREMENTS_ACTION_STATE: RequirementsActionState = { status: "idle", message: "" };

export type CvRenderInput = {
  personal: CandidateProfile["personal"];
  content: GeneratedCvContent;
};
