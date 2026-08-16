import type { GenerateCvInput } from "./provider.ts";
import { selectionJsonSchema } from "./provider.ts";

export const GEMINI_CV_SYSTEM_INSTRUCTION = `You tailor a CV by selecting and ordering verified candidate facts.

Use only facts in Candidate Profile. Never create or infer companies, roles, technologies, dates, responsibilities, achievements, metrics, projects, education, certifications, or years of experience.
Do not rewrite facts. Return only the IDs and exact skill strings present in Candidate Profile.
Select experience and achievements relevant to the saved job. Omit irrelevant facts when useful.
Never treat a missing skill as candidate experience.
Return JSON only and follow the response schema exactly.`;

export function buildGeminiCvRequest(input: GenerateCvInput): Record<string, unknown> {
  return {
    systemInstruction: { parts: [{ text: GEMINI_CV_SYSTEM_INSTRUCTION }] },
    contents: [{
      role: "user",
      parts: [{
        text: `Select the strongest verified facts for this saved job.\n\nSaved Job:\n${JSON.stringify(input.job)}\n\nCandidate Profile (contact details intentionally omitted):\n${JSON.stringify(input.candidate)}`,
      }],
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: selectionJsonSchema(input),
    },
  };
}
