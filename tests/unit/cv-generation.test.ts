import assert from "node:assert/strict";
import test from "node:test";

import { buildGeminiAnalysisRequest, buildGeminiResumeRequest, geminiThinkingLevelForStage, isHighQualityCvModel } from "../../src/features/cvs/ai/gemini-request.ts";
import { fetchGeminiWithFallback, isRetryableGeminiStatus } from "../../src/features/cvs/ai/gemini-retry.ts";
import { CvAiProviderError, extractGeminiStructuredResponse, resumeContentJsonSchema, skillSuggestionJsonSchema } from "../../src/features/cvs/ai/provider.ts";
import { nextCvVersion, parseGeneratedCvContent, parseStoredGeneratedCvContent } from "../../src/features/cvs/domain.ts";
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
  assert.equal("thinkingConfig" in analysisConfig, false);
  assert.equal("thinkingConfig" in resumeConfig, false);
  assert.equal(analysisConfig.maxOutputTokens, 4_096);
  assert.equal(resumeConfig.maxOutputTokens, 4_096);
  assert.equal("temperature" in analysisConfig, false);
  assert.equal("temperature" in resumeConfig, false);
  assert.match(JSON.stringify(analysisRequest), /Read the entire vacancy/);
  assert.match(JSON.stringify(analysisRequest), /Do not stop after the headline technologies/);
  assert.match(JSON.stringify(analysisRequest), /full description/);
  assert.match(JSON.stringify(analysisConfig.responseJsonSchema), /Comprehensive, deduplicated inventory from the entire vacancy description/);
  assert.match(JSON.stringify(resumeRequest), /Approved skill snapshot/);
  assert.match(JSON.stringify(resumeRequest), /not as the complete skills list/);
  assert.match(JSON.stringify(resumeRequest), /complementary selection from the verified candidate skills/);
  assert.match(JSON.stringify(resumeRequest), /Generate Selected Impact separately from Professional Experience/);
  assert.match(JSON.stringify(resumeRequest), /do not remove a useful Experience bullet/);
  assert.match(JSON.stringify(resumeConfig.responseJsonSchema), /Separate vacancy-specific senior-level impact statements/);
  assert.match(JSON.stringify(resumeConfig.responseJsonSchema), /never only vacancy keywords/);
  assert.doesNotMatch(JSON.stringify(resumeRequest), /mustHaveTechnical/);
  assert.doesNotMatch(JSON.stringify(resumeRequest), /alex@example\.test|Alex Example|linkedin\.com/i);
});

test("Gemini thinking is stage-specific and only emitted for known compatible models", () => {
  const job = { title: "Senior Frontend Engineer", company: "Synthetic Co", description: "React and TypeScript", technologies: ["React"] };
  const approvedSkills = [{ key: "react", label: "React", level: "commercial" as const, provenance: "existing_kb" as const }];
  const resumeInput = { job, candidate: candidateProfileForAi(profile()), analysis: EMPTY_ANALYSIS, approvedSkills };
  const config = (request: Record<string, unknown>) => request.generationConfig as Record<string, unknown>;

  assert.equal(geminiThinkingLevelForStage("gemini-3.7-flash", "analysis"), "low");
  assert.equal(geminiThinkingLevelForStage("gemini-3.7-flash", "generation"), "low");
  assert.deepEqual(config(buildGeminiAnalysisRequest({ job }, "gemini-3.7-flash")).thinkingConfig, { thinkingLevel: "low" });
  assert.deepEqual(config(buildGeminiResumeRequest(resumeInput, "gemini-3.7-flash")).thinkingConfig, { thinkingLevel: "low" });
  assert.deepEqual(config(buildGeminiResumeRequest(resumeInput, "gemini-3.6-flash")).thinkingConfig, { thinkingLevel: "medium" });
  assert.deepEqual(config(buildGeminiAnalysisRequest({ job }, "gemini-3.5-flash-lite")).thinkingConfig, { thinkingLevel: "minimal" });
  assert.equal("thinkingConfig" in config(buildGeminiResumeRequest(resumeInput, "future-model")), false);
  assert.match(JSON.stringify(buildGeminiResumeRequest(resumeInput, "gemini-3.7-flash")), /confident senior-level language/);
});

test("final CV writing requires a full Gemini Flash model", () => {
  assert.equal(isHighQualityCvModel("gemini-3.7-flash"), false);
  assert.equal(isHighQualityCvModel("gemini-3.6-flash"), true);
  assert.equal(isHighQualityCvModel("gemini-3.5-flash-lite"), false);
  assert.equal(isHighQualityCvModel("future-model"), false);
});

test("Gemini retries one retryable HTTP response and uses the fallback model", async () => {
  assert.equal(isRetryableGeminiStatus(408), true);
  assert.equal(isRetryableGeminiStatus(503), true);
  assert.equal(isRetryableGeminiStatus(429), false);
  assert.equal(isRetryableGeminiStatus(400), false);
  const endpoints: string[] = [];
  const initializedModels: string[] = [];
  const result = await fetchGeminiWithFallback(
    async (endpoint) => { endpoints.push(String(endpoint)); return new Response("{}", { status: endpoints.length === 1 ? 503 : 200 }); },
    "primary", "fallback", (model) => `https://example.test/${model}`, (model) => { initializedModels.push(model); return { method: "POST" }; },
  );
  assert.equal(result.response.status, 200);
  assert.equal(result.model, "fallback");
  assert.equal(result.attempts, 2);
  assert.deepEqual(endpoints, ["https://example.test/primary", "https://example.test/fallback"]);
  assert.deepEqual(initializedModels, ["primary", "fallback"]);
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

test("Gemini does not retry a local network failure without a provider response", async () => {
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
  const content = { headline: "Frontend Engineer", summary: null, skills: ["React"], selectedImpact: ["Vacancy-specific verified impact."], experience: [{ company: "Synthetic Labs", role: "Engineer", startDate: "2023", endDate: null, technologies: ["React"], achievements: ["A".repeat(600)] }], education: [] };
  assert.equal(parseGeneratedCvContent(content).ok, true);
  content.experience[0].achievements = ["A".repeat(601)];
  assert.equal(parseGeneratedCvContent(content).ok, false);
  assert.equal(nextCvVersion([]), 1);
  assert.equal(nextCvVersion([1, 5, 3]), 6);
});

test("legacy stored CV content remains readable without weakening new writes", () => {
  const previousCurrentContent = {
    headline: "Frontend Engineer",
    summary: null,
    skills: ["React"],
    experience: [{ company: "Synthetic Labs", role: "Engineer", startDate: "2023", endDate: null, technologies: ["React"], achievements: ["A".repeat(600)] }],
    education: [],
  };
  const previousCurrent = parseStoredGeneratedCvContent(previousCurrentContent);
  if (!previousCurrent.ok) assert.fail(previousCurrent.message);
  assert.deepEqual(previousCurrent.data.selectedImpact, []);
  assert.equal(previousCurrent.data.experience[0].achievements[0].length, 600);

  const legacyContent = {
    headline: "",
    summary: "",
    skills: ["React"],
    experience: [{ company: "Synthetic Labs", role: "Engineer", startDate: "", endDate: "", technologies: ["React"], achievements: [] }],
    education: [{ institution: "Synthetic University", degree: "", startDate: "", endDate: "" }],
  };
  assert.equal(parseGeneratedCvContent(legacyContent).ok, false);
  const stored = parseStoredGeneratedCvContent(legacyContent);
  if (!stored.ok) assert.fail(stored.message);
  assert.equal(stored.data.headline, null);
  assert.equal(stored.data.experience[0].startDate, null);
  assert.equal(stored.data.education[0].degree, null);
  assert.deepEqual(stored.data.selectedImpact, []);
  assert.deepEqual(stored.data.experience[0].achievements, []);
});
