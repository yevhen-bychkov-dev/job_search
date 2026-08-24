import assert from "node:assert/strict";
import test from "node:test";

import { deterministicResume } from "../../src/features/cvs/ai/provider.ts";
import {
  approvedSkillsFromRequirements,
  materializeResumeContent,
  materializeVacancyAnalysis,
  recoverSavedJobRequirementsFromAnalysis,
  savedJobRequirementsFromAnalysis,
  savedJobRequirementsToAnalysis,
  validateRequirementApproval,
  validateSavedJobRequirements,
} from "../../src/features/cvs/domain.ts";
import { renderResumeTemplate, validateResumeTemplateText } from "../../src/features/cvs/template.ts";
import { candidateProfileForAi, CANDIDATE_PROFILE_EXAMPLE, parseCandidateProfile } from "../../src/features/knowledge/candidate-profile.ts";
import { inferLegacyRequirementsApproval, isMissingColumnError } from "../../src/lib/data/migration-compat.ts";

function profile() {
  const parsed = parseCandidateProfile(JSON.parse(JSON.stringify(CANDIDATE_PROFILE_EXAMPLE)) as unknown);
  if (!parsed.ok) assert.fail(parsed.message);
  return parsed.data;
}

const JOB = { title: "Frontend Engineer", company: "Synthetic Co", description: "Build React interfaces with GraphQL and accessibility.", technologies: ["React", "GraphQL"] };
const RAW_SKILLS = { skills: [{ label: "GraphQL", category: "technical", importance: "must_have" }], senioritySignals: [], atsKeywords: ["GraphQL"], employerTerminology: ["interfaces"] };

test("vacancy extraction is strict and deterministic matching supplements configured technologies", () => {
  const parsed = materializeVacancyAnalysis(RAW_SKILLS, JOB, profile());
  if (!parsed.ok) assert.fail(parsed.message);
  assert.deepEqual(parsed.data.mustHaveTechnical.map(({ label }) => label), ["GraphQL", "React"]);
  assert.equal(parsed.data.mustHaveTechnical.find(({ label }) => label === "React")?.status, "supported");
  assert.equal(parsed.data.mustHaveTechnical.find(({ label }) => label === "GraphQL")?.status, "unconfirmed");
  assert.equal(materializeVacancyAnalysis({ ...RAW_SKILLS, extra: true }, JOB, profile()).ok, false);
  assert.equal(materializeVacancyAnalysis({ ...RAW_SKILLS, skills: [{ label: "GraphQL", category: "invented", importance: "must_have" }] }, JOB, profile()).ok, false);
  assert.equal(materializeVacancyAnalysis({ ...RAW_SKILLS, skills: Array.from({ length: 41 }, (_, index) => ({ label: `Synthetic skill ${index}`, category: "technical", importance: "nice_to_have" })) }, JOB, profile()).ok, false);
});

test("skills are editable but every retained skill requires an explicit approval level", () => {
  const analysisResult = materializeVacancyAnalysis(RAW_SKILLS, JOB, profile());
  if (!analysisResult.ok) assert.fail(analysisResult.message);
  const draft = savedJobRequirementsFromAnalysis(analysisResult.data);
  assert.match(validateRequirementApproval(draft), /experience level/i);
  const editedResult = validateSavedJobRequirements(draft.map((skill) => ({ ...skill, level: skill.label === "GraphQL" ? "familiar" : "commercial", label: skill.label === "GraphQL" ? "GraphQL APIs" : skill.label, source: "user" })));
  if (!editedResult.ok) assert.fail(editedResult.message);
  assert.equal(validateRequirementApproval(editedResult.data), "");
  const approved = approvedSkillsFromRequirements(editedResult.data);
  assert.deepEqual(approved.map(({ label, level }) => [label, level]), [["GraphQL APIs", "familiar"], ["React", "commercial"]]);
  const reconstructed = savedJobRequirementsToAnalysis({ analysis: analysisResult.data, requirements: editedResult.data, approvedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  assert.equal(reconstructed.mustHaveTechnical.find(({ label }) => label === "GraphQL APIs")?.status, "confirmed_familiar");
});

test("legacy saved requirements remain readable during the approved_at migration window", () => {
  assert.equal(isMissingColumnError({ message: "column job_resume_requirements.approved_at does not exist" }, "approved_at"), true);
  assert.equal(isMissingColumnError({ code: "PGRST204", message: "Could not find the 'approved_at' column" }, "approved_at"), true);
  assert.equal(isMissingColumnError({ code: "42501", message: "permission denied" }, "approved_at"), false);

  const analysis = materializeVacancyAnalysis(RAW_SKILLS, JOB, profile());
  if (!analysis.ok) assert.fail(analysis.message);
  const draft = savedJobRequirementsFromAnalysis(analysis.data);
  const updatedAt = "2026-08-23T10:00:00.000Z";
  assert.equal(inferLegacyRequirementsApproval(draft.map((requirement) => ({ ...requirement, level: "commercial" })), updatedAt), updatedAt);
  assert.equal(inferLegacyRequirementsApproval(draft, updatedAt), null);
  assert.equal(inferLegacyRequirementsApproval([], updatedAt), null);
});

test("invalid legacy requirement edits can be rebuilt as an unapproved draft", () => {
  const analysis = materializeVacancyAnalysis(RAW_SKILLS, JOB, profile());
  if (!analysis.ok) assert.fail(analysis.message);
  const duplicate = structuredClone(analysis.data.mustHaveTechnical[0]);
  duplicate.key = "graphql-secondary";
  analysis.data.niceToHaveTechnical.push(duplicate);
  const recovered = recoverSavedJobRequirementsFromAnalysis(analysis.data);
  assert.equal(recovered.filter((requirement) => requirement.label === duplicate.label).length, 1);
  assert.equal(validateSavedJobRequirements(recovered).ok, true);
});

test("approved skills are authoritative in generated content and unsupported claims fall back to cited facts", () => {
  const candidate = profile();
  const analysisResult = materializeVacancyAnalysis(RAW_SKILLS, JOB, candidate);
  if (!analysisResult.ok) assert.fail(analysisResult.message);
  const approvedSkills = [
    { key: "react", label: "React", level: "commercial" as const, provenance: "existing_kb" as const },
    { key: "graphql", label: "GraphQL", level: "familiar" as const, provenance: "explicit_user_confirmation" as const },
    { key: "aws", label: "AWS", level: "none" as const, provenance: "explicit_user_confirmation" as const },
  ];
  const raw = deterministicResume({ job: JOB, candidate: candidateProfileForAi(candidate), analysis: analysisResult.data, approvedSkills });
  raw.skills = ["React", "AWS", "Invented Platform"];
  const experiences = raw.experience as Array<{ experienceId: string; bullets: Array<{ text: string; sourceAchievementIds: string[] }> }>;
  experiences[0].bullets[0].text = "Managed 8 engineers and increased revenue by 20%.";
  const materialized = materializeResumeContent(candidate, raw, approvedSkills);
  if (!materialized.ok) assert.fail(materialized.message);
  assert.deepEqual(materialized.data.skills, ["React", "Familiar: GraphQL"]);
  assert.equal(materialized.data.experience[0].achievements[0], "Built accessible shared components used across internal applications.");
});

test("template validation blocks executable content and supports supplied-template legacy markers", () => {
  assert.match(validateResumeTemplateText("<html><body><script>bad()</script>{{resume.name}}{{resume.experience}}</body></html>"), /scripts/);
  const template = `<!doctype html><html><body>
    <h1>{{resume.name}}</h1><h2>{{resume.title}}</h2><p>{{resume.professional_summary}}</p>
    <a>{{resume.linkedin}}</a><ul><!-- SELECTED_IMPACT_ITEMS --></ul>
    <section><ul><!-- SYNTHETIC_LABS_BULLETS --></ul></section>
    <section><!-- SKILL_GROUPS --></section>
  </body></html>`;
  assert.equal(validateResumeTemplateText(template), "");
  const candidate = profile();
  const html = renderResumeTemplate(template, { personal: { ...candidate.personal, name: "<Synthetic>" }, content: { headline: "Product Engineer", summary: "Verified summary.", skills: ["React"], experience: [{ company: "Synthetic Labs", role: "Engineer", startDate: "2023", endDate: null, technologies: ["React"], achievements: ["Built <safe> components."] }], education: [] } });
  assert.match(html, /&lt;Synthetic&gt;/);
  assert.match(html, /Product Engineer/);
  assert.match(html, /Built &lt;safe&gt; components\./);
  assert.match(html, /Relevant skills/);
  assert.doesNotMatch(html, /\{\{resume|SELECTED_IMPACT_ITEMS|_BULLETS|SKILL_GROUPS/);
});
