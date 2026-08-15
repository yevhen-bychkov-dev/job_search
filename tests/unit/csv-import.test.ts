import assert from "node:assert/strict";
import test from "node:test";

import { parseCsv, previewCsv } from "../../src/features/import/csv.ts";

test("parses quoted commas, escaped quotes, and embedded newlines", () => {
  const rows = parseCsv('Title,Company,Notes\r\n"Frontend, Senior","Example ""Labs""","First line\nSecond line"');
  assert.deepEqual(rows, [
    ["Title", "Company", "Notes"],
    ["Frontend, Senior", 'Example "Labs"', "First line\nSecond line"],
  ]);
});

test("maps common Google Sheets headers and produces normalized jobs", () => {
  const preview = previewCsv(
    "Job Title,Organization,Status,URL,Tech Stack,Date Discovered\nFrontend Engineer,Synthetic Labs,Screening,https://example.test/job/1,React|TypeScript,2026-08-01",
    "2026-08-15",
  );
  assert.equal(preview.fatalError, "");
  assert.equal(preview.rows[0].job?.status, "screening");
  assert.deepEqual(preview.rows[0].job?.technologies, ["React", "TypeScript"]);
});

test("reports invalid and duplicate rows before import", () => {
  const preview = previewCsv(
    "Title,Company,Location\nFrontend Engineer,Synthetic Labs,Warsaw\nFrontend Engineer,Synthetic Labs,Warsaw\n,Missing title,Warsaw",
    "2026-08-15",
  );
  assert.match(preview.rows[1].errors.duplicate, /Duplicate/);
  assert.match(preview.rows[2].errors.title, /title/i);
});

test("requires title and company mappings and rejects unclosed quotes", () => {
  assert.match(previewCsv("Foo,Bar\na,b").fatalError, /title and company/i);
  assert.match(previewCsv('Title,Company\n"Broken,Synthetic Labs').fatalError, /unclosed/i);
});

test("preserves spreadsheet-formula-like cells as inert text", () => {
  const preview = previewCsv(
    'Title,Company,Notes\nFrontend Engineer,Synthetic Labs,"=HYPERLINK(""https://example.test"",""click"")"',
    "2026-08-15",
  );
  assert.equal(preview.fatalError, "");
  assert.equal(preview.rows[0].job?.notes, '=HYPERLINK("https://example.test","click")');
});
