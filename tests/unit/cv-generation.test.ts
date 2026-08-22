import assert from "node:assert/strict";
import test from "node:test";

import { CvAiProviderError, extractGeminiStructuredResponse, geminiResponseSchema, selectionJsonSchema } from "../../src/features/cvs/ai/provider.ts";
import { buildGeminiCvRequest } from "../../src/features/cvs/ai/gemini-request.ts";
import { fetchGeminiWithFallback, fetchGeminiWithRetry, isRetryableGeminiStatus } from "../../src/features/cvs/ai/gemini-retry.ts";
import { candidateProfileForAi, CANDIDATE_PROFILE_EXAMPLE, parseCandidateProfile } from "../../src/features/knowledge/candidate-profile.ts";
import { materializeGeneratedCv, mergeResumeConfirmations, nextCvVersion, parseCvSelection, parseGeneratedCvContent } from "../../src/features/cvs/domain.ts";
import { renderCvPdf } from "../../src/features/cvs/pdf.ts";

function profile() {
  const parsed = parseCandidateProfile(JSON.parse(JSON.stringify(CANDIDATE_PROFILE_EXAMPLE)) as unknown);
  if (!parsed.ok) assert.fail(parsed.message);
  return parsed.data;
}

function verifiedSelection() {
  return {
    includeSummary: true,
    skillOrder: ["TypeScript", "React"],
    experience: [{ experienceId: "synthetic-labs-frontend", achievementIds: ["accessible-design-system"] }],
    educationIds: ["example-university-cs"],
  };
}

test("candidate profile parsing is strict and removes contact PII from Gemini input", () => {
  const candidate = profile();
  const aiInput = candidateProfileForAi(candidate);
  const serialized = JSON.stringify(aiInput);
  assert.doesNotMatch(serialized, /alex@example\.test/i);
  assert.doesNotMatch(serialized, /000 000 000/);
  assert.doesNotMatch(serialized, /linkedin\.com/);
  assert.doesNotMatch(serialized, /Alex Example/);
  assert.doesNotMatch(serialized, /Warsaw, Poland/);
  assert.match(serialized, /accessible shared components/);

  const withUnknownField = { ...JSON.parse(JSON.stringify(CANDIDATE_PROFILE_EXAMPLE)), unsupported: true };
  assert.deepEqual(parseCandidateProfile(withUnknownField), {
    ok: false,
    message: "Candidate profile must be an object with only supported fields.",
  });
});

test("model selections materialize only exact verified facts", () => {
  const candidate = profile();
  const generated = materializeGeneratedCv(candidate, verifiedSelection());
  if (!generated.ok) assert.fail(generated.message);
  assert.equal(generated.data.experience[0].company, "Synthetic Labs");
  assert.deepEqual(generated.data.experience[0].achievements, [
    "Built accessible shared components used across internal applications.",
  ]);
  assert.equal(generated.data.summary, candidate.summary);
  assert.deepEqual(generated.data.skills, ["TypeScript", "React"]);
});

test("stored CV content accepts the candidate profile achievement length limit", () => {
  const content = {
    headline: "Frontend Engineer",
    summary: null,
    skills: ["TypeScript"],
    experience: [{
      company: "Synthetic Labs",
      role: "Frontend Engineer",
      startDate: "2023",
      endDate: null,
      technologies: ["TypeScript"],
      achievements: ["A".repeat(600)],
    }],
    education: [],
  };
  assert.equal(parseGeneratedCvContent(content).ok, true);
  content.experience[0].achievements = ["A".repeat(601)];
  assert.equal(parseGeneratedCvContent(content).ok, false);
});

test("invalid or invented model selections are rejected", () => {
  assert.equal(parseCvSelection({ ...verifiedSelection(), extra: "unsupported" }).ok, false);
  const inventedSkill = materializeGeneratedCv(profile(), { ...verifiedSelection(), skillOrder: ["AWS"] });
  assert.equal(inventedSkill.ok, false);
  if (!inventedSkill.ok) assert.match(inventedSkill.message, /outside the verified profile/);
  const wrongAchievement = {
    ...verifiedSelection(),
    experience: [{ experienceId: "synthetic-labs-frontend", achievementIds: ["invented-metric"] }],
  };
  const result = materializeGeneratedCv(profile(), wrongAchievement);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /outside its verified experience/);
});

test("version calculation always advances the highest valid version", () => {
  assert.equal(nextCvVersion([]), 1);
  assert.equal(nextCvVersion([1, 5, 3]), 6);
  assert.equal(nextCvVersion([0, -1, 2.5, 2]), 3);
});

test("Gemini schema constrains response shape without embedding candidate enums", () => {
  const candidate = profile();
  const schema = selectionJsonSchema({
    job: { title: "Frontend Engineer", company: "Synthetic Co", description: "React role", technologies: ["React"] },
    candidate: candidateProfileForAi(candidate),
  });
  const serialized = JSON.stringify(schema);
  assert.doesNotMatch(serialized, /synthetic-labs-frontend/);
  assert.doesNotMatch(serialized, /accessible-design-system/);
  assert.doesNotMatch(serialized, /TypeScript/);
  assert.doesNotMatch(serialized, /alex@example\.test/i);
  const properties = schema.properties as Record<string, Record<string, unknown>>;
  assert.equal(properties.skillOrder.maxItems, candidate.skills.length);
  assert.equal(properties.experience.maxItems, candidate.experience.length);
  assert.equal(properties.educationIds.maxItems, candidate.education.length);
  assert.ok(serialized.length < 2_000);
});

test("Gemini schema conversion omits array limits rejected by GenerateContent", () => {
  assert.deepEqual(geminiResponseSchema({
    type: "array",
    minItems: 1,
    maxItems: 20,
    items: { type: "string" },
  }), {
    type: "ARRAY",
    items: { type: "STRING" },
  });
});

test("Gemini retries transient HTTP failures and not permanent request errors", async () => {
  assert.equal(isRetryableGeminiStatus(408), true);
  assert.equal(isRetryableGeminiStatus(429), true);
  assert.equal(isRetryableGeminiStatus(503), true);
  assert.equal(isRetryableGeminiStatus(400), false);

  const statuses = [503, 503, 200];
  const delays: number[] = [];
  const response = await fetchGeminiWithRetry(
    async () => new Response("{}", { status: statuses.shift() ?? 500 }),
    "https://example.test/gemini",
    () => ({ method: "POST" }),
    async (milliseconds) => { delays.push(milliseconds); },
    () => 0.5,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(delays, [1_000, 2_000]);

  let permanentAttempts = 0;
  const permanent = await fetchGeminiWithRetry(
    async () => { permanentAttempts += 1; return new Response("{}", { status: 400 }); },
    "https://example.test/gemini",
    () => ({ method: "POST" }),
  );
  assert.equal(permanent.status, 400);
  assert.equal(permanentAttempts, 1);
});

test("Gemini falls back only after persistent primary-model 503 responses", async () => {
  const endpoints: string[] = [];
  const delays: number[] = [];
  const result = await fetchGeminiWithFallback(
    async (endpoint) => {
      endpoints.push(String(endpoint));
      return new Response("{}", { status: endpoints.length <= 5 ? 503 : 200 });
    },
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    (model) => `https://example.test/${model}`,
    () => ({ method: "POST" }),
    async (milliseconds) => { delays.push(milliseconds); },
    () => 0.5,
  );
  assert.equal(result.response.status, 200);
  assert.equal(result.model, "gemini-3.6-flash");
  assert.deepEqual(endpoints, [
    ...Array.from({ length: 5 }, () => "https://example.test/gemini-3.7-flash"),
    "https://example.test/gemini-3.6-flash",
  ]);
  assert.deepEqual(delays, [1_000, 2_000, 4_000, 8_000]);

  let fallbackCalls = 0;
  const permanent = await fetchGeminiWithFallback(
    async () => { fallbackCalls += 1; return new Response("{}", { status: 400 }); },
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    (model) => `https://example.test/${model}`,
    () => ({ method: "POST" }),
  );
  assert.equal(permanent.response.status, 400);
  assert.equal(permanent.model, "gemini-3.7-flash");
  assert.equal(fallbackCalls, 1);
});

test("resume confirmations are deduplicated with the newest explicit answer winning", () => {
  const merged = mergeResumeConfirmations(
    [{ key: "azure", label: "Azure", level: "familiar", provenance: "explicit_user_confirmation" }],
    [
      { key: "azure", label: "Azure cloud stack", level: "commercial", provenance: "explicit_user_confirmation" },
      { key: "cqrs", label: "CQRS", level: "none", provenance: "explicit_user_confirmation" },
    ],
  );
  assert.deepEqual(merged, [
    { key: "azure", label: "Azure cloud stack", level: "commercial", provenance: "explicit_user_confirmation" },
    { key: "cqrs", label: "CQRS", level: "none", provenance: "explicit_user_confirmation" },
  ]);
});

test("Gemini request includes saved-job context and excludes contact PII", () => {
  const candidate = profile();
  const request = buildGeminiCvRequest({
    job: {
      title: "Frontend Engineer",
      company: "Synthetic Hiring Co",
      description: "Build accessible React interfaces with TypeScript.",
      technologies: ["React", "TypeScript"],
    },
    candidate: candidateProfileForAi(candidate),
  });
  const serialized = JSON.stringify(request);
  assert.match(serialized, /Frontend Engineer/);
  assert.match(serialized, /Synthetic Hiring Co/);
  assert.match(serialized, /Build accessible React interfaces/);
  assert.match(serialized, /TypeScript/);
  assert.match(serialized, /accessible shared components/);
  assert.match(serialized, /application\/json/);
  const generationConfig = request.generationConfig as Record<string, unknown>;
  assert.equal(generationConfig.responseMimeType, "application/json");
  assert.deepEqual(generationConfig.responseSchema, geminiResponseSchema(selectionJsonSchema({
    job: {
      title: "Frontend Engineer",
      company: "Synthetic Hiring Co",
      description: "Build accessible React interfaces with TypeScript.",
      technologies: ["React", "TypeScript"],
    },
    candidate: candidateProfileForAi(candidate),
  })));
  assert.equal("responseFormat" in generationConfig, false);
  assert.doesNotMatch(serialized, /Alex Example/);
  assert.doesNotMatch(serialized, /alex@example\.test/i);
  assert.doesNotMatch(serialized, /000 000 000/);
  assert.doesNotMatch(serialized, /linkedin\.com/);
});

test("Gemini response extraction accepts structured JSON and rejects invalid model responses", () => {
  assert.deepEqual(
    extractGeminiStructuredResponse({ candidates: [{ content: { parts: [{ text: JSON.stringify(verifiedSelection()) }] } }] }),
    verifiedSelection(),
  );
  assert.throws(
    () => extractGeminiStructuredResponse({ candidates: [{ content: { parts: [{ text: "not-json" }] } }] }),
    (error: unknown) => error instanceof CvAiProviderError && error.code === "GEMINI_INVALID_JSON",
  );
  assert.throws(() => extractGeminiStructuredResponse({ candidates: [] }), /no structured CV selection/);
});

test("deterministic renderer emits a compact PDF with verified contact details", () => {
  const candidate = profile();
  const generated = materializeGeneratedCv(candidate, verifiedSelection());
  if (!generated.ok) assert.fail(generated.message);
  const bytes = renderCvPdf({ personal: candidate.personal, content: generated.data });
  const text = new TextDecoder().decode(bytes);
  assert.match(text, /^%PDF-1\.4/);
  assert.match(text, /Alex Example/);
  assert.match(text, /alex@example\.test/);
  assert.match(text, /xref/);
  assert.ok(bytes.byteLength < 2 * 1024 * 1024);
});

test("deterministic renderer paginates maximum-length variable content without drawing below the body margin", () => {
  const long = "Verified synthetic accessibility engineering achievement with TypeScript and deterministic validation";
  const bytes = renderCvPdf({
    personal: {
      name: long,
      title: long,
      location: long,
      email: "synthetic@example.test",
      phone: "+48 000 000 000",
      links: Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`Link ${index + 1}`, `https://example.test/${"verified/".repeat(30)}${index}`])),
    },
    content: {
      headline: long,
      summary: `${long}. `.repeat(12),
      skills: Array.from({ length: 100 }, (_, index) => `Verified skill ${index + 1} ${"technology".repeat(5)}`),
      experience: [{
        company: long.repeat(2),
        role: long.repeat(2),
        startDate: "2020-01",
        endDate: null,
        technologies: Array.from({ length: 50 }, (_, index) => `Verified technology ${index + 1}`),
        achievements: Array.from({ length: 30 }, (_, index) => `${long} ${index + 1}. ${long}`),
      }],
      education: [{ institution: long.repeat(2), degree: long.repeat(2), startDate: "2016", endDate: "2019" }],
    },
  });
  const pdf = new TextDecoder().decode(bytes);
  const pageCount = Number(/\/Count (\d+)/.exec(pdf)?.[1] ?? "0");
  const textCoordinates = [...pdf.matchAll(/1 0 0 1 [\d.]+ ([\d.]+) Tm/g)].map((match) => Number(match[1]));
  assert.ok(pageCount > 2);
  assert.ok(textCoordinates.length > 0);
  assert.ok(textCoordinates.every((coordinate) => coordinate >= 26));
  assert.ok(pdf.includes("Skills \\(continued\\)"));
  assert.match(pdf, /Frontend|Verified synthetic accessibility/);
});
