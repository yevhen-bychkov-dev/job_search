import type { CandidateProfileForAi } from "@/features/knowledge/candidate-profile";

import type { CvSelection, ResumeConfirmation, VacancyAnalysis } from "../types";

export type VacancyAiJob = {
  title: string;
  company: string;
  description: string;
  technologies: string[];
};

export type AnalyzeVacancyInput = {
  job: VacancyAiJob;
  candidate: CandidateProfileForAi;
  confirmations: ResumeConfirmation[];
};

export type GenerateCvInput = AnalyzeVacancyInput & { analysis: VacancyAnalysis };

export interface CvAiProvider {
  readonly providerId: string;
  readonly model: string;
  analyzeVacancy(input: AnalyzeVacancyInput): Promise<unknown>;
  generateCv(input: GenerateCvInput): Promise<unknown>;
}

export class CvAiProviderError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CvAiProviderError";
    this.code = code;
  }
}

function schemaRequirement() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["key", "label", "category", "importance", "status", "evidence"],
    properties: {
      key: { type: "string" }, label: { type: "string" },
      category: { type: "string", enum: ["technical", "tooling", "architecture", "domain", "responsibility", "collaboration", "leadership"] },
      importance: { type: "string", enum: ["must_have", "nice_to_have"] },
      status: { type: "string", enum: ["supported", "unconfirmed"] },
      evidence: { type: "array", items: { type: "string" }, maxItems: 10 },
    },
  };
}

export function vacancyAnalysisJsonSchema(): Record<string, unknown> {
  const requirement = schemaRequirement();
  const list = { type: "array", maxItems: 80, items: requirement };
  return {
    type: "object", additionalProperties: false,
    required: ["mustHaveTechnical", "niceToHaveTechnical", "tooling", "architecture", "domainKnowledge", "responsibilities", "ownershipExpectations", "senioritySignals", "collaborationExpectations", "leadershipExpectations", "atsKeywords", "employerTerminology"],
    properties: {
      mustHaveTechnical: list, niceToHaveTechnical: list, tooling: list, architecture: list,
      domainKnowledge: list, responsibilities: list, ownershipExpectations: list,
      senioritySignals: { type: "array", maxItems: 30, items: { type: "string" } },
      collaborationExpectations: list, leadershipExpectations: list,
      atsKeywords: { type: "array", maxItems: 100, items: { type: "string" } },
      employerTerminology: { type: "array", maxItems: 100, items: { type: "string" } },
    },
  };
}

export function resumeContentJsonSchema(): Record<string, unknown> {
  return {
    type: "object", additionalProperties: false,
    required: ["headline", "summary", "skills", "experience", "educationIds"],
    properties: {
      headline: { type: ["string", "null"] }, summary: { type: ["string", "null"] },
      skills: { type: "array", maxItems: 100, items: { type: "string" } },
      experience: { type: "array", minItems: 1, maxItems: 20, items: {
        type: "object", additionalProperties: false, required: ["experienceId", "bullets"],
        properties: {
          experienceId: { type: "string" },
          bullets: { type: "array", minItems: 1, maxItems: 30, items: {
            type: "object", additionalProperties: false, required: ["text", "sourceAchievementIds"],
            properties: { text: { type: "string" }, sourceAchievementIds: { type: "array", minItems: 1, items: { type: "string" } } },
          } },
        },
      } },
      educationIds: { type: "array", maxItems: 20, items: { type: "string" } },
    },
  };
}

export function deterministicAnalysis(input: AnalyzeVacancyInput): VacancyAnalysis {
  const known = new Set([...input.candidate.skills, ...input.candidate.experience.flatMap((experience) => experience.technologies)].map((value) => value.toLocaleLowerCase("en")));
  const requirements = input.job.technologies.map((technology) => ({
    key: technology.toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120),
    label: technology, category: "technical" as const, importance: "must_have" as const,
    status: known.has(technology.toLocaleLowerCase("en")) ? "supported" as const : "unconfirmed" as const,
    evidence: known.has(technology.toLocaleLowerCase("en")) ? [technology] : [],
  }));
  return {
    mustHaveTechnical: requirements, niceToHaveTechnical: [], tooling: [], architecture: [], domainKnowledge: [], responsibilities: [], ownershipExpectations: [],
    senioritySignals: input.job.title.toLocaleLowerCase("en").includes("senior") ? ["senior title"] : [],
    collaborationExpectations: [], leadershipExpectations: [],
    atsKeywords: [...new Set([input.job.title, ...input.job.technologies])].filter(Boolean),
    employerTerminology: [...input.job.technologies],
  };
}

export function deterministicResume(input: GenerateCvInput): Record<string, unknown> {
  return {
    headline: input.job.title || input.candidate.professionalTitle,
    summary: input.candidate.summary,
    skills: [...input.candidate.skills],
    experience: input.candidate.experience.map((experience) => ({
      experienceId: experience.id,
      bullets: experience.achievements.map((achievement) => ({ text: achievement.text, sourceAchievementIds: [achievement.id] })),
    })),
    educationIds: input.candidate.education.map((education) => education.id),
  };
}

export function selectionJsonSchema(input: { candidate: CandidateProfileForAi; job?: VacancyAiJob }): Record<string, unknown> {
  const maximumAchievements = input.candidate.experience.reduce((maximum, experience) => Math.max(maximum, experience.achievements.length), 0);
  return {
    type: "object", additionalProperties: false, required: ["includeSummary", "skillOrder", "experience", "educationIds"],
    properties: {
      includeSummary: { type: "boolean" }, skillOrder: { type: "array", maxItems: input.candidate.skills.length, items: { type: "string" } },
      experience: { type: "array", minItems: 1, maxItems: input.candidate.experience.length, items: { type: "object", additionalProperties: false, required: ["experienceId", "achievementIds"], properties: { experienceId: { type: "string" }, achievementIds: { type: "array", maxItems: maximumAchievements, items: { type: "string" } } } } },
      educationIds: { type: "array", maxItems: input.candidate.education.length, items: { type: "string" } },
    },
  };
}

function isSchemaRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Convert the app's JSON Schema into Gemini's GenerateContent Schema shape.
 * Gemini rejects these nested schemas as too complex when array cardinality
 * hints are included. The application parsers still enforce every array limit.
 */
export function geminiResponseSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const rawType = schema.type;
  if (typeof rawType === "string") {
    result.type = rawType.toUpperCase();
  } else if (Array.isArray(rawType)) {
    const nonNullType = rawType.find((type): type is string => typeof type === "string" && type !== "null");
    result.type = (nonNullType ?? "null").toUpperCase();
    if (rawType.includes("null")) result.nullable = true;
  }

  for (const field of ["format", "title", "description", "enum", "minLength", "maxLength", "pattern", "minimum", "maximum", "required", "propertyOrdering"]) {
    if (field in schema) result[field] = schema[field];
  }
  if (isSchemaRecord(schema.items)) result.items = geminiResponseSchema(schema.items);
  if (isSchemaRecord(schema.properties)) {
    const properties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      if (isSchemaRecord(value)) properties[key] = geminiResponseSchema(value);
    }
    result.properties = properties;
  }
  if (Array.isArray(schema.anyOf)) result.anyOf = schema.anyOf.filter(isSchemaRecord).map((item) => geminiResponseSchema(item));
  return result;
}

export function deterministicSelection(input: { candidate: CandidateProfileForAi; job?: VacancyAiJob }): CvSelection {
  return { includeSummary: Boolean(input.candidate.summary), skillOrder: [...input.candidate.skills], experience: input.candidate.experience.map((experience) => ({ experienceId: experience.id, achievementIds: experience.achievements.map((achievement) => achievement.id) })), educationIds: input.candidate.education.map((education) => education.id) };
}

export function extractGeminiStructuredResponse(payload: unknown): unknown {
  if (typeof payload !== "object" || payload === null || !("candidates" in payload) || !Array.isArray(payload.candidates)) throw new CvAiProviderError("GEMINI_EMPTY_RESPONSE", "Gemini returned no structured CV selection.");
  const first = payload.candidates[0];
  if (typeof first !== "object" || first === null || !("content" in first) || typeof first.content !== "object" || first.content === null || !("parts" in first.content) || !Array.isArray(first.content.parts)) throw new CvAiProviderError("GEMINI_EMPTY_RESPONSE", "Gemini returned no structured CV selection.");
  const responseText = (first.content.parts as unknown[]).map((part: unknown) => typeof part === "object" && part !== null && "text" in part && typeof part.text === "string" ? part.text : "").join("").trim();
  if (!responseText) throw new CvAiProviderError("GEMINI_EMPTY_RESPONSE", "Gemini returned no structured CV selection.");
  try { return JSON.parse(responseText) as unknown; } catch { throw new CvAiProviderError("GEMINI_INVALID_JSON", "Gemini returned invalid JSON."); }
}
