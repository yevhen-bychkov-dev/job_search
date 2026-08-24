import assert from "node:assert/strict";
import test from "node:test";

import { buildGeminiAnalysisRequest, buildGeminiResumeRequest } from "../../src/features/cvs/ai/gemini-request.ts";
import { fetchGeminiWithFallback, isRetryableGeminiStatus } from "../../src/features/cvs/ai/gemini-retry.ts";
import { CvAiProviderError, extractGeminiStructuredResponse, resumeContentJsonSchema, skillSuggestionJsonSchema } from "../../src/features/cvs/ai/provider.ts";
import { nextCvVersion, parseGeneratedCvContent } from "../../src/features/cvs/domain.ts";
import { candidateProfileForAi, CANDIDATE_PROFILE_EXAMPLE, parseCandidateProfile } from "../../src/features/knowledge/candidate-profile.ts";
import type { VacancyAnalysis } from "../../src/features/cvs/types.ts";

function profile() {
  const parsed = parseCandidateProfile(JSON.parse(JSON.stringify(CANDIDATE_PROFILE_EXAMPLE)) as unknown);
  if (!parsed.ok) assert.fail(parsed.message);
  return parsed.data;
}

const EMPTY_ANALYSIS: VacancyAnalysis = {
  mustHaveTechnical: [], niceToHaveTechnical: [], tooling: [], architecture: [], domainKnowledge: [], responsibilities: [], ownershipExpectations: [], collaborationExpectations: [], leadershipExpectations: [], senioritySignals: [], atsKeywords: [], employerTerminology: [],
};

test("Candidate Profile parsing is strict and the Gemini projection removes contact PII", () => {
  const serialized = JSON.stringify(candidateProfileForAi(profile()));
  assert.doesNotMatch(serialized, /Alex Example|alex@example\.test|000 000 000|linkedin\.com|Warsaw, Poland/i);
  assert.match(serialized, /accessible shared components/);
  assert.equal(parseCandidateProfile({ ...CANDIDATE_PROFILE_EXAMPLE, unsupported: true }).ok, false);
});

test("Gemini requests use current JSON Schema structured outputs", () => {
  const job = { title: "Frontend Engineer", company: "Synthetic Co", description: "React and TypeScript", technologies: ["React"] };
  const analysisRequest = buildGeminiAnalysisRequest({ job });
  const approvedSkills = [{ key: "react", label: "React", level: "commercial" as const, provenance: "existing_kb" as const }];
  const resumeRequest = buildGeminiResumeRequest({ job, candidate: candidateProfileForAi(profile()), analysis: EMPTY_ANALYSIS, approvedSkills });
  const analysisConfig = analysisRequest.generationConfig as Record<string, unknown>;
  const resumeConfig = resumeRequest.generationConfig as Record<string, unknown>;
  assert.deepEqual(analysisConfig.responseJsonSchema, skillSuggestionJsonSchema());
  assert.deepEqual(resumeConfig.responseJsonSchema, resumeContentJsonSchema());
  assert.doesNotMatch(JSON.stringify(analysisConfig.responseJsonSchema), /minItems|maxItems/);
  assert.doesNotMatch(JSON.stringify(resumeConfig.responseJsonSchema), /minItems|maxItems/);
  assert.equal("responseSchema" in analysisConfig, false);
  assert.equal("responseSchema" in resumeConfig, false);
  assert.deepEqual(analysisConfig.thinkingConfig, { thinkingLevel: "minimal" });
  assert.deepEqual(resumeConfig.thinkingConfig, { thinkingLevel: "minimal" });
  assert.equal(analysisConfig.maxOutputTokens, 2_048);
  assert.equal(resumeConfig.maxOutputTokens, 4_096);
  assert.equal("temperature" in analysisConfig, false);
  assert.equal("temperature" in resumeConfig, false);
  assert.match(JSON.stringify(resumeRequest), /Approved skill snapshot/);
  assert.doesNotMatch(JSON.stringify(resumeRequest), /mustHaveTechnical/);
  assert.doesNotMatch(JSON.stringify(resumeRequest), /alex@example\.test|Alex Example|linkedin\.com/i);
});

test("Gemini retries one infrastructure failure and uses the fallback model", async () => {
  assert.equal(isRetryableGeminiStatus(408), true);
  assert.equal(isRetryableGeminiStatus(503), true);
  assert.equal(isRetryableGeminiStatus(429), false);
  assert.equal(isRetryableGeminiStatus(400), false);
  const endpoints: string[] = [];
  const delays: number[] = [];
  const result = await fetchGeminiWithFallback(
    async (endpoint) => { endpoints.push(String(endpoint)); return new Response("{}", { status: endpoints.length === 1 ? 503 : 200 }); },
    "primary", "fallback", (model) => `https://example.test/${model}`, () => ({ method: "POST" }),
    async (milliseconds: number) => { delays.push(milliseconds); },
  );
  assert.equal(result.response.status, 200);
  assert.equal(result.model, "fallback");
  assert.equal(result.attempts, 2);
  assert.deepEqual(endpoints, ["https://example.test/primary", "https://example.test/fallback"]);
  assert.deepEqual(delays, [300]);
});

test("Gemini never amplifies quota or permanent request failures", async () => {
  for (const status of [400, 429]) {
    let attempts = 0;
    const result = await fetchGeminiWithFallback(
      async () => { attempts += 1; return new Response("{}", { status }); },
      "primary", "fallback", (model) => `https://example.test/${model}`, () => ({ method: "POST" }),
    );
    assert.equal(result.response.status, status);
    assert.equal(attempts, 1);
  }
});

test("Gemini does not duplicate an ambiguously timed-out request", async () => {
  let attempts = 0;
  const timeout = new Error("Synthetic timeout");
  timeout.name = "TimeoutError";
  await assert.rejects(fetchGeminiWithFallback(
    async () => { attempts += 1; throw timeout; },
    "primary", "fallback", (model) => `https://example.test/${model}`, () => ({ method: "POST" }),
  ), timeout);
  assert.equal(attempts, 1);
});

test("Gemini response extraction distinguishes invalid, empty, and truncated output", () => {
  const value = { skills: [], senioritySignals: [], atsKeywords: [], employerTerminology: [] };
  assert.deepEqual(extractGeminiStructuredResponse({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(value) }] } }] }), value);
  assert.throws(() => extractGeminiStructuredResponse({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "{}" }] } }] }), (error: unknown) => error instanceof CvAiProviderError && error.code === "GEMINI_TRUNCATED_RESPONSE");
  assert.throws(() => extractGeminiStructuredResponse({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "bad" }] } }] }), (error: unknown) => error instanceof CvAiProviderError && error.code === "GEMINI_INVALID_JSON");
  assert.throws(() => extractGeminiStructuredResponse({ candidates: [] }), (error: unknown) => error instanceof CvAiProviderError && error.code === "GEMINI_EMPTY_RESPONSE");
});

test("stored content validation and CV versioning remain deterministic", () => {
  const content = { headline: "Frontend Engineer", summary: null, skills: ["React"], experience: [{ company: "Synthetic Labs", role: "Engineer", startDate: "2023", endDate: null, technologies: ["React"], achievements: ["A".repeat(600)] }], education: [] };
  assert.equal(parseGeneratedCvContent(content).ok, true);
  content.experience[0].achievements = ["A".repeat(601)];
  assert.equal(parseGeneratedCvContent(content).ok, false);
  assert.equal(nextCvVersion([]), 1);
  assert.equal(nextCvVersion([1, 5, 3]), 6);
});
