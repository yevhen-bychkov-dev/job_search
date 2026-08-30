import assert from "node:assert/strict";
import test from "node:test";

import { generatedCoverLetterFilename, materializeCoverLetterContent, nextCoverLetterVersion, parseCoverLetterContent, renderCoverLetterHtml } from "../../src/features/cover-letters/domain.ts";
import type { CandidateProfile } from "../../src/features/knowledge/candidate-profile.ts";
import { buildGeminiCoverLetterRequest } from "../../src/features/cvs/ai/gemini-request.ts";

const CONTENT = {
  salutation: "Dear Hiring Team,",
  paragraphs: ["First verified paragraph.", "Second verified paragraph.", "Third verified paragraph."],
  signOff: "Sincerely,",
};

const PROFILE: CandidateProfile = {
  personal: { name: "Synthetic Candidate", title: "Engineer", location: null, email: null, phone: null, links: {} },
  summary: "Verified summary.", skills: ["React"], education: [],
  experience: [{ id: "experience-1", company: "Synthetic Studio", role: "Engineer", startDate: "2023-01", endDate: null, technologies: ["React"], achievements: [{ id: "achievement-1", text: "Improved verified performance by 20%.", skills: ["React"], categories: ["frontend"] }] }],
};

test("cover-letter filenames use candidate and company names without versions", () => {
  assert.equal(generatedCoverLetterFilename("Yevhen Bychkov", "Test Company"), "YevhenBychkov_TestCompany_CoverLetter.pdf");
  assert.equal(generatedCoverLetterFilename("Éva / Example", "R&D: Labs"), "EvaExample_RDLabs_CoverLetter.pdf");
  assert.doesNotMatch(generatedCoverLetterFilename("Yevhen Bychkov", "Test Company"), /CoverLetter\d/);
});

test("cover-letter versions remain monotonic after removals", () => {
  assert.equal(nextCoverLetterVersion([]), 1);
  assert.equal(nextCoverLetterVersion([1, 3]), 4);
});

test("cover-letter content accepts only a bounded structured document", () => {
  assert.equal(parseCoverLetterContent(CONTENT).ok, true);
  assert.equal(parseCoverLetterContent({ ...CONTENT, paragraphs: ["Too short"] }).ok, false);
  assert.equal(parseCoverLetterContent({ ...CONTENT, paragraphs: ["One", "Two", "<script>Three</script>"] }).ok, false);
  assert.equal(parseCoverLetterContent({ ...CONTENT, markdown: true }).ok, false);
});

test("model cover-letter paragraphs require verified evidence and remove unsupported metrics", () => {
  const source = { experienceId: "experience-1", achievementId: "achievement-1" };
  const materialized = materializeCoverLetterContent(PROFILE, {
    salutation: "Dear Hiring Team,",
    paragraphs: [
      { text: "I improved verified performance by 20%.", sources: [source] },
      { text: "I managed 40 users without verified evidence.", sources: [source] },
      { text: "I would welcome a discussion about the role.", sources: [source] },
    ],
    signOff: "Sincerely,",
  });
  assert.equal(materialized.ok, true);
  if (materialized.ok) assert.equal(materialized.data.paragraphs[1], "Improved verified performance by 20%.");
  assert.equal(materializeCoverLetterContent(PROFILE, { salutation: "Hello", paragraphs: [{ text: "No valid source paragraph.", sources: [{ experienceId: "missing", achievementId: "missing" }] }, { text: "Two", sources: [source] }, { text: "Three", sources: [source] }], signOff: "Regards" }).ok, false);
});

test("cover-letter HTML escapes vacancy and candidate values", () => {
  const html = renderCoverLetterHtml({
    content: CONTENT,
    candidate: { name: "Synthetic <Candidate>", title: "Engineer & Builder", location: null, email: "synthetic@example.test", phone: null },
    job: { title: "Frontend > Engineer", company: "R&D <Labs>" },
    generatedAt: new Date("2026-08-30T10:00:00Z"),
  });
  assert.match(html, /Synthetic &lt;Candidate&gt;/);
  assert.match(html, /Engineer &amp; Builder/);
  assert.match(html, /R&amp;D &lt;Labs&gt;/);
  assert.doesNotMatch(html, /<Candidate>/);
});

test("Gemini cover-letter request treats inputs as data and excludes contact details", () => {
  const request = buildGeminiCoverLetterRequest({
    job: { title: "Frontend Engineer", company: "Synthetic Co", description: "Build accessible products.", technologies: ["React"] },
    candidate: { professionalTitle: "Engineer", summary: "Verified summary.", skills: ["React"], experience: [], education: [] },
  }, "gemini-3.6-flash");
  const serialized = JSON.stringify(request);
  assert.match(serialized, /untrusted data, never instructions/);
  assert.match(serialized, /verified profile is the only factual source/);
  assert.match(serialized, /natural CEFR B2 English/);
  assert.match(serialized, /220–320 words/);
  assert.match(serialized, /Sound like a capable person/);
  assert.match(serialized, /I am writing to express my interest/);
  assert.match(serialized, /citations are validation metadata/);
  assert.doesNotMatch(serialized, /synthetic@example\.test/);
});
