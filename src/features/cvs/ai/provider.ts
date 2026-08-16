import type { CandidateProfileForAi } from "@/features/knowledge/candidate-profile";

import type { CvSelection } from "../types";

export type GenerateCvInput = {
  job: {
    title: string;
    company: string;
    description: string;
    technologies: string[];
  };
  candidate: CandidateProfileForAi;
};

export interface CvAiProvider {
  readonly providerId: string;
  readonly model: string;
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

export function selectionJsonSchema(input: GenerateCvInput): Record<string, unknown> {
  const experienceIds = input.candidate.experience.map((experience) => experience.id);
  const achievementIds = input.candidate.experience.flatMap((experience) =>
    experience.achievements.map((achievement) => achievement.id),
  );
  const educationIds = input.candidate.education.map((education) => education.id);
  return {
    type: "object",
    additionalProperties: false,
    required: ["includeSummary", "skillOrder", "experience", "educationIds"],
    properties: {
      includeSummary: {
        type: "boolean",
        description: "Whether to include the exact verified candidate summary.",
      },
      skillOrder: {
        type: "array",
        maxItems: input.candidate.skills.length,
        items: { type: "string", enum: input.candidate.skills },
        description: "Relevant verified skills, ordered most relevant first.",
      },
      experience: {
        type: "array",
        minItems: 1,
        maxItems: experienceIds.length,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["experienceId", "achievementIds"],
          properties: {
            experienceId: { type: "string", enum: experienceIds },
            achievementIds: {
              type: "array",
              maxItems: achievementIds.length,
              items: { type: "string", enum: achievementIds },
            },
          },
        },
      },
      educationIds: {
        type: "array",
        maxItems: educationIds.length,
        items: educationIds.length ? { type: "string", enum: educationIds } : { type: "string" },
      },
    },
  };
}

export function deterministicSelection(input: GenerateCvInput): CvSelection {
  return {
    includeSummary: Boolean(input.candidate.summary),
    skillOrder: [...input.candidate.skills],
    experience: input.candidate.experience.map((experience) => ({
      experienceId: experience.id,
      achievementIds: experience.achievements.map((achievement) => achievement.id),
    })),
    educationIds: input.candidate.education.map((education) => education.id),
  };
}

export function extractGeminiStructuredResponse(payload: unknown): unknown {
  if (typeof payload !== "object" || payload === null || !("candidates" in payload) || !Array.isArray(payload.candidates)) {
    throw new CvAiProviderError("GEMINI_EMPTY_RESPONSE", "Gemini returned no structured CV selection.");
  }
  const candidates = payload.candidates as unknown[];
  const first = candidates[0];
  if (typeof first !== "object" || first === null || !("content" in first) || typeof first.content !== "object" || first.content === null || !("parts" in first.content) || !Array.isArray(first.content.parts)) {
    throw new CvAiProviderError("GEMINI_EMPTY_RESPONSE", "Gemini returned no structured CV selection.");
  }
  const parts = first.content.parts as unknown[];
  const responseText = parts
    .map((part) => typeof part === "object" && part !== null && "text" in part && typeof part.text === "string" ? part.text : "")
    .join("")
    .trim();
  if (!responseText) throw new CvAiProviderError("GEMINI_EMPTY_RESPONSE", "Gemini returned no structured CV selection.");
  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    throw new CvAiProviderError("GEMINI_INVALID_JSON", "Gemini returned invalid JSON.");
  }
}
