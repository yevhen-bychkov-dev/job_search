import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeFilename, validateKnowledgeFile } from "../../src/features/knowledge/types.ts";

test("sanitizes path separators and control characters from filenames", () => {
  assert.equal(sanitizeFilename('..\\private/<resume>\u0000.pdf'), "..-private--resume--.pdf");
});

test("accepts safe knowledge files and rejects unsupported or oversized files", () => {
  assert.equal(validateKnowledgeFile(new File(["safe"], "resume.txt", { type: "text/plain" })), "");
  assert.match(validateKnowledgeFile(new File(["x"], "script.html", { type: "text/html" })), /PDF/);
  const tooLarge = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "huge.pdf", { type: "application/pdf" });
  assert.match(validateKnowledgeFile(tooLarge), /4 MB/);
});
