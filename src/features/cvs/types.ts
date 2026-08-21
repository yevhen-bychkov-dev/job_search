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
  "generating",
  "rendering",
  "completed",
  "failed",
  "cancelled",
] as const;
export type ResumeGenerationStatus = (typeof RESUME_GENERATION_STATUSES)[number];

export const RESUME_CONFIRMATION_LEVELS = ["commercial", "familiar", "none"] as const;
export type ResumeConfirmationLevel = (typeof RESUME_CONFIRMATION_LEVELS)[number];

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

export type ResumeGeneration = {
  id: string;
  jobId: string;
  status: ResumeGenerationStatus;
  idempotencyKey: string;
  analysis: VacancyAnalysis | null;
  confirmations: ResumeConfirmation[];
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

export const INITIAL_CV_ACTION_STATE: CvActionState = { status: "idle", message: "" };

export type CvRenderInput = {
  personal: CandidateProfile["personal"];
  content: GeneratedCvContent;
};
