import assert from "node:assert/strict";
import test from "node:test";

import { candidateProfileForAi, CANDIDATE_PROFILE_EXAMPLE, parseCandidateProfile } from "../../src/features/knowledge/candidate-profile.ts";
import { confirmationQuestions, matchVacancyAnalysis, materializeResumeContent, parseVacancyAnalysis, savedJobRequirementsFromAnalysis, savedJobRequirementsToAnalysis, validateSavedJobRequirements } from "../../src/features/cvs/domain.ts";
import { deterministicAnalysis, deterministicResume } from "../../src/features/cvs/ai/provider.ts";
import { renderResumeTemplate, validateResumeTemplateText } from "../../src/features/cvs/template.ts";

function profile() {
  const parsed = parseCandidateProfile(JSON.parse(JSON.stringify(CANDIDATE_PROFILE_EXAMPLE)) as unknown);
  if (!parsed.ok) assert.fail(parsed.message);
  return parsed.data;
}

test("vacancy analysis is strict and absence remains unconfirmed", () => {
  const analysis = deterministicAnalysis({ job: { title: "Senior Frontend Engineer", company: "Synthetic Co", description: "Build interfaces", technologies: ["React", "GraphQL"] }, candidate: candidateProfileForAi(profile()), confirmations: [] });
  const parsed = parseVacancyAnalysis(analysis);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const matched = matchVacancyAnalysis(parsed.data, profile());
  assert.equal(matched.mustHaveTechnical.find((item) => item.label === "GraphQL")?.status, "unconfirmed");
  assert.deepEqual(confirmationQuestions(matched).map((question) => question.label), ["GraphQL"]);
});

test("vacancy requirement keys are stabilized from labels", () => {
  const parsed = parseVacancyAnalysis({
    mustHaveTechnical: [{ key: "_1_requirement-dotnet-backend", label: ".NET backend", category: "technical", importance: "must_have", status: "unconfirmed", evidence: [] }],
    niceToHaveTechnical: [], tooling: [], architecture: [], domainKnowledge: [], responsibilities: [], ownershipExpectations: [],
    senioritySignals: [], collaborationExpectations: [], leadershipExpectations: [], atsKeywords: [], employerTerminology: [],
  });
  if (!parsed.ok) assert.fail(parsed.message);
  assert.equal(parsed.data.mustHaveTechnical[0].key, "net-backend");
});

test("commercial confirmation changes matching, while familiar does not", () => {
  const analysis = deterministicAnalysis({ job: { title: "Frontend Engineer", company: "Synthetic Co", description: "", technologies: ["GraphQL"] }, candidate: candidateProfileForAi(profile()), confirmations: [] });
  const parsed = parseVacancyAnalysis(analysis);
  if (!parsed.ok) assert.fail(parsed.message);
  const familiar = matchVacancyAnalysis(parsed.data, profile(), [{ key: "graphql", label: "GraphQL", level: "familiar", provenance: "explicit_user_confirmation" }]);
  assert.equal(familiar.mustHaveTechnical[0].status, "confirmed_familiar");
  const commercial = matchVacancyAnalysis(parsed.data, profile(), [{ key: "graphql", label: "GraphQL", level: "commercial", provenance: "explicit_user_confirmation" }]);
  assert.equal(commercial.mustHaveTechnical[0].status, "supported");
});

test("job requirements preserve approved levels and support safe manual edits", () => {
  const candidate = profile();
  const analysis = matchVacancyAnalysis(
    deterministicAnalysis({ job: { title: "Frontend Engineer", company: "Synthetic Co", description: "", technologies: ["React", "GraphQL"] }, candidate: candidateProfileForAi(candidate), confirmations: [] }),
    candidate,
  );
  const requirements = savedJobRequirementsFromAnalysis(analysis);
  assert.deepEqual(requirements.map((requirement) => [requirement.label, requirement.level]), [["React", "commercial"], ["GraphQL", "unconfirmed"]]);
  const edited = validateSavedJobRequirements(requirements.map((requirement) => requirement.label === "GraphQL" ? { ...requirement, level: "familiar", evidence: [...requirement.evidence, ...requirement.evidence] } : requirement));
  if (!edited.ok) assert.fail(edited.message);
  const updated = savedJobRequirementsToAnalysis({ analysis, requirements: edited.data, updatedAt: new Date().toISOString() });
  assert.equal(updated.mustHaveTechnical.find((requirement) => requirement.label === "GraphQL")?.status, "confirmed_familiar");
});

test("final structured content allows safe senior inference but rejects unsupported claims", () => {
  const candidate = profile();
  const generated = deterministicResume({ job: { title: "Frontend Engineer", company: "Synthetic Co", description: "", technologies: ["React"] }, candidate: candidateProfileForAi(candidate), confirmations: [], analysis: matchVacancyAnalysis(deterministicAnalysis({ job: { title: "Frontend Engineer", company: "Synthetic Co", description: "", technologies: ["React"] }, candidate: candidateProfileForAi(candidate), confirmations: [] }), candidate) });
  const first = generated.experience as Array<{ experienceId: string; bullets: Array<{ text: string; sourceAchievementIds: string[] }> }>;
  first[0].bullets[0] = { text: "Designed and implemented accessible shared components used across internal applications.", sourceAchievementIds: ["accessible-design-system"] };
  const accepted = materializeResumeContent(candidate, generated);
  assert.equal(accepted.ok, true);
  first[0].bullets[0] = { text: "Managed a team of 8 engineers and increased revenue by 20%.", sourceAchievementIds: ["accessible-design-system"] };
  const rejected = materializeResumeContent(candidate, generated);
  assert.equal(rejected.ok, false);
});

test("final structured content drops unsupported model-added skills while preserving verified skills", () => {
  const candidate = profile();
  const generated = deterministicResume({ job: { title: "Frontend Engineer", company: "Synthetic Co", description: "", technologies: ["React"] }, candidate: candidateProfileForAi(candidate), confirmations: [], analysis: matchVacancyAnalysis(deterministicAnalysis({ job: { title: "Frontend Engineer", company: "Synthetic Co", description: "", technologies: ["React"] }, candidate: candidateProfileForAi(candidate), confirmations: [] }), candidate) });
  generated.skills = ["React", "Invented Platform"];
  const materialized = materializeResumeContent(candidate, generated);
  assert.equal(materialized.ok, true);
  if (materialized.ok) assert.deepEqual(materialized.data.skills, ["React"]);
});

test("resume templates reject executable content and render escaped data", () => {
  assert.match(validateResumeTemplateText("<html><body><script>bad()</script>{{resume.name}}{{resume.experience}}</body></html>"), /scripts/);
  const normalMeta = "<html><head><meta name=\"viewport\" content=\"width=device-width\"></head><body>{{resume.name}}{{resume.experience}}</body></html>";
  assert.equal(validateResumeTemplateText(normalMeta), "");
  assert.match(validateResumeTemplateText("<html><body>{{NAME}}{{resume.experience}}</body></html>"), /\{\{NAME\}\}/);
  const template = "<html><body><h1>{{resume.name}}</h1><p>{{resume.email}}</p>{{resume.experience}}</body></html>";
  assert.equal(validateResumeTemplateText(template), "");
  const candidate = profile();
  const html = renderResumeTemplate(template, { personal: { ...candidate.personal, name: "<Synthetic>" }, content: { headline: "Frontend", summary: null, skills: [], experience: [{ company: "Synthetic Co", role: "Engineer", startDate: "2023", endDate: null, technologies: [], achievements: ["Built <safe> components."] }], education: [] } });
  assert.match(html, /&lt;Synthetic&gt;/);
  assert.match(html, /Built &lt;safe&gt; components\./);
  assert.doesNotMatch(html, /\{\{resume/);
});
