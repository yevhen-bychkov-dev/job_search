import assert from "node:assert/strict";
import test from "node:test";

import {
  dateInTimeZone,
  formDataToRecord,
  jobDuplicateKey,
  normalizeSourceUrl,
  parseJobInput,
  parseJobStatus,
} from "../../src/features/jobs/domain.ts";

const base = {
  title: "Senior Frontend Engineer",
  company: "Synthetic Labs",
  status: "applied",
  source: "Example board",
  sourceUrl: "https://EXAMPLE.com/jobs/42/?utm_source=sheet#details",
  location: "Warsaw",
  workMode: "hybrid",
  employmentType: "full-time",
  salary: "20k–25k PLN",
  description: "Build accessible products.",
  technologies: "React, TypeScript; React | Next.js",
  notes: "Synthetic test record.",
  discoveredOn: "2026-08-14",
  appliedOn: "2026-08-15",
};

test("normalizes and validates a complete job", () => {
  const result = parseJobInput(base);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data.technologies, ["React", "TypeScript", "Next.js"]);
  assert.equal(result.data.workMode, "hybrid");
  assert.equal(result.data.employmentType, "full_time");
  assert.equal(result.data.sourceUrl, "https://example.com/jobs/42");
});

test("rejects missing identity fields, unsafe URLs, and impossible dates", () => {
  const result = parseJobInput({ ...base, title: "", company: "x", sourceUrl: "javascript:alert(1)", discoveredOn: "2026-02-30" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(Object.keys(result.errors).sort(), ["company", "discoveredOn", "sourceUrl", "title"]);
});

test("rejects embedded URL credentials and applied dates before discovery", () => {
  assert.equal(normalizeSourceUrl("https://user:password@example.test/job"), "");
  const result = parseJobInput({ ...base, discoveredOn: "2026-08-15", appliedOn: "2026-08-14" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors.appliedOn, /earlier/i);
});

test("normalizes status aliases without accepting arbitrary values", () => {
  assert.equal(parseJobStatus("Interviewing"), "interview");
  assert.equal(parseJobStatus("unknown"), null);
});

test("source URL is the primary duplicate key and strips tracking", () => {
  const first = { ...base, sourceUrl: "https://example.com/job/7?utm_campaign=a" };
  const second = { ...base, title: "Different title", sourceUrl: "https://EXAMPLE.com/job/7/#top" };
  assert.equal(jobDuplicateKey(first), jobDuplicateKey(second));
  assert.equal(normalizeSourceUrl(first.sourceUrl), "https://example.com/job/7");
});

test("fallback duplicate key uses normalized company, title, and location", () => {
  const first = { ...base, sourceUrl: "", title: "Frontend  Engineer" };
  const second = { ...base, sourceUrl: "", title: "frontend-engineer", company: "SYNTHETIC LABS" };
  assert.equal(jobDuplicateKey(first), jobDuplicateKey(second));
});

test("Warsaw date is correct around UTC midnight and DST transitions", () => {
  assert.equal(dateInTimeZone(new Date("2026-03-28T23:30:00Z")), "2026-03-29");
  assert.equal(dateInTimeZone(new Date("2026-10-24T22:30:00Z")), "2026-10-25");
});

test("form conversion allowlists fields and bounds values returned after errors", () => {
  const formData = new FormData();
  formData.set("title", "x".repeat(500));
  formData.set("unexpected", "do not reflect this value");
  const values = formDataToRecord(formData);
  assert.equal(values.title.length, 200);
  assert.equal(values.unexpected, undefined);
});
