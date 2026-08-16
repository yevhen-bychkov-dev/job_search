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
  createdAt: string;
};

export type CvActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const INITIAL_CV_ACTION_STATE: CvActionState = { status: "idle", message: "" };

export type CvRenderInput = {
  personal: CandidateProfile["personal"];
  content: GeneratedCvContent;
};
