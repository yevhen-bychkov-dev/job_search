import type { CandidateProfileForAi } from "@/features/knowledge/candidate-profile";

import type { ApprovedResumeSkill, GeneratedCvContent, VacancyAnalysis } from "../types";

export type VacancyAiJob = {
  title: string;
  company: string;
  description: string;
  technologies: string[];
};

export type AnalyzeVacancyInput = {
  job: VacancyAiJob;
};

export type GenerateCvInput = {
  job: VacancyAiJob;
  candidate: CandidateProfileForAi;
  analysis: VacancyAnalysis;
  approvedSkills: ApprovedResumeSkill[];
};

export type AssessCvInput = {
  job: VacancyAiJob & { sourceUrl: string };
  cv: GeneratedCvContent;
};

export type ResumeAiContext = {
  generationId?: string;
  jobId?: string;
  stage: "analysis" | "generation" | "assessment";
};

export interface CvAiProvider {
  readonly providerId: string;
  readonly model: string;
  analyzeVacancy(input: AnalyzeVacancyInput, context?: ResumeAiContext): Promise<unknown>;
  generateCv(input: GenerateCvInput, context?: ResumeAiContext): Promise<unknown>;
  assessCv(input: AssessCvInput, context?: ResumeAiContext): Promise<unknown>;
}

export class CvAiProviderError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CvAiProviderError";
    this.code = code;
  }
}

export function skillSuggestionJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["skills", "senioritySignals", "atsKeywords", "employerTerminology"],
    properties: {
      skills: {
        type: "array",
        description: "Comprehensive, deduplicated inventory from the entire vacancy description: technical skills, tools, practices, domain knowledge, responsibilities, ownership, collaboration, and leadership expectations that materially affect candidate suitability or resume tailoring.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "category", "importance"],
          properties: {
            label: { type: "string", description: "Concise standalone skill or expectation copied or faithfully normalized from anywhere in the vacancy." },
            category: {
              type: "string",
              enum: ["technical", "tooling", "architecture", "domain", "responsibility", "ownership", "collaboration", "leadership"],
            },
            importance: { type: "string", description: "must_have for required, expected, or core-role items; nice_to_have only for explicitly preferred, bonus, optional, or advantage items.", enum: ["must_have", "nice_to_have"] },
          },
        },
      },
      senioritySignals: { type: "array", items: { type: "string" } },
      atsKeywords: { type: "array", items: { type: "string" } },
      employerTerminology: { type: "array", items: { type: "string" } },
    },
  };
}

export function resumeContentJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["headline", "summary", "skills", "selectedImpact", "experience", "educationIds"],
    properties: {
      headline: { type: "string", description: "A truthful vacancy-specific professional headline." },
      summary: { type: "string", description: "A concise tailored summary grounded only in the verified profile." },
      skills: {
        type: "array",
        description: "A vacancy-prioritized blend of approved skills and complementary verified candidate skills; never only vacancy keywords.",
        items: { type: "string" },
      },
      selectedImpact: {
        type: "array",
        description: "Separate vacancy-specific senior-level impact statements synthesized from cited verified achievements, not copied Experience bullets.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["text", "sources"],
          properties: {
            text: { type: "string" },
            sources: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["experienceId", "achievementId"],
                properties: {
                  experienceId: { type: "string" },
                  achievementId: { type: "string" },
                },
              },
            },
          },
        },
      },
      experience: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["experienceId", "bullets"],
          properties: {
            experienceId: { type: "string" },
            bullets: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["text", "sourceAchievementIds"],
                properties: {
                  text: { type: "string" },
                  sourceAchievementIds: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
        },
      },
      educationIds: { type: "array", items: { type: "string" } },
    },
  };
}

export function cvFitAssessmentJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["fitScore", "summary", "strengths", "gaps"],
    properties: {
      fitScore: {
        type: "integer",
        minimum: 0,
        maximum: 10,
        description: "Overall demonstrated fit of this exact CV to this vacancy, from 0 (no fit) through 10 (exceptional fit).",
      },
      summary: { type: "string", description: "A concise explanation of the score grounded only in the supplied CV and vacancy." },
      strengths: { type: "array", items: { type: "string" }, description: "Up to five strongest demonstrated matches." },
      gaps: { type: "array", items: { type: "string" }, description: "Up to five important vacancy requirements that are absent or weakly evidenced in this CV." },
    },
  };
}

export function deterministicAnalysis(input: AnalyzeVacancyInput): Record<string, unknown> {
  return {
    skills: input.job.technologies.map((technology) => ({ label: technology, category: "technical", importance: "must_have" })),
    senioritySignals: input.job.title.toLocaleLowerCase("en").includes("senior") ? ["Senior role"] : [],
    atsKeywords: [...new Set([input.job.title, ...input.job.technologies])].filter(Boolean),
    employerTerminology: [...input.job.technologies],
  };
}

export function deterministicResume(input: GenerateCvInput): Record<string, unknown> {
  const approved = input.approvedSkills
    .filter((skill) => skill.level !== "none")
    .map((skill) => skill.level === "familiar" ? `Familiar: ${skill.label}` : skill.label);
  return {
    headline: input.job.title || input.candidate.professionalTitle,
    summary: input.job.title
      ? `${input.job.title} focused on ${approved.slice(0, 3).join(", ") || input.candidate.professionalTitle || "product engineering"}.`
      : input.candidate.summary,
    skills: approved,
    selectedImpact: [],
    experience: input.candidate.experience.map((experience) => ({
      experienceId: experience.id,
      bullets: experience.achievements.map((achievement) => ({ text: achievement.text, sourceAchievementIds: [achievement.id] })),
    })),
    educationIds: input.candidate.education.map((education) => education.id),
  };
}

export function deterministicCvAssessment(input: AssessCvInput): Record<string, unknown> {
  const normalized = (value: string) => value.trim().toLocaleLowerCase("en");
  const cvSkills = new Set(input.cv.skills.map(normalized));
  const requirements = input.job.technologies.filter(Boolean);
  const matched = requirements.filter((technology) => cvSkills.has(normalized(technology)));
  const missing = requirements.filter((technology) => !cvSkills.has(normalized(technology)));
  const fitScore = requirements.length === 0 ? 5 : Math.round((matched.length / requirements.length) * 10);
  return {
    fitScore,
    summary: `This CV demonstrates ${matched.length} of ${requirements.length} explicit technology matches for the saved vacancy.`,
    strengths: matched.slice(0, 5).map((technology) => `Demonstrates ${technology}.`),
    gaps: missing.slice(0, 5).map((technology) => `${technology} is not explicit in this CV.`),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function extractGeminiStructuredResponse(payload: unknown): unknown {
  if (!isRecord(payload) || !Array.isArray(payload.candidates) || payload.candidates.length === 0) {
    throw new CvAiProviderError("GEMINI_EMPTY_RESPONSE", "Gemini returned no structured output.");
  }
  const first = payload.candidates[0];
  if (!isRecord(first)) throw new CvAiProviderError("GEMINI_EMPTY_RESPONSE", "Gemini returned no structured output.");
  if (first.finishReason === "MAX_TOKENS") {
    throw new CvAiProviderError("GEMINI_TRUNCATED_RESPONSE", "Gemini reached its output limit before completing the JSON response.");
  }
  if (typeof first.finishReason === "string" && !["STOP", "FINISH_REASON_UNSPECIFIED"].includes(first.finishReason)) {
    throw new CvAiProviderError("GEMINI_RESPONSE_BLOCKED", "Gemini did not complete the structured response.");
  }
  if (!isRecord(first.content) || !Array.isArray(first.content.parts)) {
    throw new CvAiProviderError("GEMINI_EMPTY_RESPONSE", "Gemini returned no structured output.");
  }
  const responseText = first.content.parts
    .map((part) => isRecord(part) && typeof part.text === "string" ? part.text : "")
    .join("")
    .trim();
  if (!responseText) throw new CvAiProviderError("GEMINI_EMPTY_RESPONSE", "Gemini returned no structured output.");
  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    throw new CvAiProviderError("GEMINI_INVALID_JSON", "Gemini returned invalid JSON.");
  }
}
