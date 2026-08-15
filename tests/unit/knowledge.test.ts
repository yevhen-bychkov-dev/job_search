import assert from "node:assert/strict";
import test from "node:test";

import {
  sanitizeFilename,
  validateKnowledgeFile,
  validateKnowledgeFileContent,
} from "../../src/features/knowledge/types.ts";

test("sanitizes path separators and control characters from filenames", () => {
  assert.equal(sanitizeFilename('..\\private/<resume>\u0000.pdf'), "..-private--resume--.pdf");
});

test("accepts safe knowledge files and rejects unsupported or oversized files", async () => {
  assert.equal(await validateKnowledgeFile(new File(["safe"], "resume.txt", { type: "text/plain" })), "");
  assert.match(await validateKnowledgeFile(new File(["x"], "script.html", { type: "text/html" })), /PDF/);
  const tooLarge = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "huge.pdf", { type: "application/pdf" });
  assert.match(await validateKnowledgeFile(tooLarge), /4 MB/);
});

test("rejects mismatched extensions, forged PDFs, and invalid UTF-8 text", async () => {
  assert.match(
    await validateKnowledgeFile(new File(["plain text"], "resume.pdf", { type: "application/pdf" })),
    /contents/i,
  );
  assert.match(
    await validateKnowledgeFile(new File(["%PDF-1.7"], "resume.txt", { type: "application/pdf" })),
    /extension/i,
  );
  assert.match(validateKnowledgeFileContent("text/plain", new Uint8Array([0xc3, 0x28])), /contents/i);
});

test("recognizes PDF and DOCX container signatures", () => {
  assert.equal(
    validateKnowledgeFileContent("application/pdf", new TextEncoder().encode("%PDF-1.7\nsynthetic")),
    "",
  );
  const docx = new Uint8Array([
    0x50, 0x4b, 0x03, 0x04,
    ...new TextEncoder().encode("[Content_Types].xml word/document.xml"),
  ]);
  assert.equal(
    validateKnowledgeFileContent(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      docx,
    ),
    "",
  );
});
