import { documentFilenamePart } from "../cvs/domain.ts";
import type { CandidateProfile } from "../knowledge/candidate-profile.ts";

import type { CoverLetterContent } from "./types";

type ParseResult<T> = { ok: true; data: T } | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function generatedCoverLetterFilename(candidateName: string, companyName: string): string {
  return `${documentFilenamePart(candidateName, "Candidate")}_${documentFilenamePart(companyName, "Company")}_CoverLetter.pdf`;
}

export function nextCoverLetterVersion(versions: readonly number[]): number {
  return versions.length === 0 ? 1 : Math.max(...versions) + 1;
}

export function parseCoverLetterContent(value: unknown): ParseResult<CoverLetterContent> {
  if (!isRecord(value) || Object.keys(value).some((key) => !["salutation", "paragraphs", "signOff"].includes(key))) {
    return { ok: false, message: "Generated cover-letter content contains unsupported fields." };
  }
  const salutation = typeof value.salutation === "string" ? value.salutation.trim() : "";
  const signOff = typeof value.signOff === "string" ? value.signOff.trim() : "";
  if (!salutation || salutation.length > 160 || !signOff || signOff.length > 100) {
    return { ok: false, message: "Generated cover-letter greeting or sign-off is invalid." };
  }
  if (!Array.isArray(value.paragraphs) || value.paragraphs.length < 3 || value.paragraphs.length > 5) {
    return { ok: false, message: "A cover letter must contain three to five paragraphs." };
  }
  const paragraphs: string[] = [];
  for (const paragraph of value.paragraphs) {
    if (typeof paragraph !== "string") return { ok: false, message: "Generated cover-letter paragraphs are invalid." };
    const text = paragraph.trim();
    if (!text || text.length > 1_500 || /<[^>]+>/.test(text)) {
      return { ok: false, message: "Generated cover-letter paragraphs are invalid." };
    }
    paragraphs.push(text);
  }
  return { ok: true, data: { salutation, paragraphs, signOff } };
}

function normalized(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}+#.]+/gu, " ").trim();
}

function containsUnsupportedClaim(text: string, source: string): boolean {
  const normalizedText = normalized(text);
  const normalizedSource = normalized(source);
  const unsupported = ["managed", "managing", "manager", "management", "mentored", "mentoring", "led a team", "team of", "revenue", "customers", "users", "promoted", "award", "organization wide", "cross team", "director", "head of"];
  return unsupported.some((phrase) => normalizedText.includes(phrase) && !normalizedSource.includes(phrase));
}

function numbers(value: string): string[] {
  return value.match(/\b\d[\d,.%]*\b/g) ?? [];
}

export function materializeCoverLetterContent(profile: CandidateProfile, value: unknown): ParseResult<CoverLetterContent> {
  if (!isRecord(value) || Object.keys(value).some((key) => !["salutation", "paragraphs", "signOff"].includes(key))) return { ok: false, message: "The model cover letter contains unsupported fields." };
  if (!Array.isArray(value.paragraphs) || value.paragraphs.length < 3 || value.paragraphs.length > 5) return { ok: false, message: "The model cover letter must contain three to five paragraphs." };
  const experienceById = new Map(profile.experience.map((experience) => [experience.id, experience]));
  const paragraphs: string[] = [];
  for (const item of value.paragraphs) {
    if (!isRecord(item) || Object.keys(item).some((key) => !["text", "sources"].includes(key)) || typeof item.text !== "string" || item.text.trim().length < 10 || item.text.length > 1_500 || /<[^>]+>/.test(item.text) || !Array.isArray(item.sources) || item.sources.length < 1 || item.sources.length > 8) {
      return { ok: false, message: "Every model cover-letter paragraph must cite verified achievements." };
    }
    const sourceText: string[] = [];
    const sourceKeys = new Set<string>();
    for (const reference of item.sources) {
      if (!isRecord(reference) || Object.keys(reference).some((key) => !["experienceId", "achievementId"].includes(key)) || typeof reference.experienceId !== "string" || typeof reference.achievementId !== "string") return { ok: false, message: "Every model cover-letter paragraph must cite verified achievements." };
      const source = experienceById.get(reference.experienceId)?.achievements.find((achievement) => achievement.id === reference.achievementId);
      const key = `${reference.experienceId}:${reference.achievementId}`;
      if (!source || sourceKeys.has(key)) return { ok: false, message: "Cover-letter evidence must reference distinct verified achievements." };
      sourceKeys.add(key);
      sourceText.push(source.text);
    }
    const text = item.text.trim();
    const evidence = sourceText.join(" ");
    paragraphs.push(containsUnsupportedClaim(text, evidence) || numbers(text).some((number) => !evidence.includes(number)) ? evidence : text);
  }
  return parseCoverLetterContent({ salutation: value.salutation, paragraphs, signOff: value.signOff });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderCoverLetterHtml(input: {
  content: CoverLetterContent;
  candidate: { name: string; title: string | null; location: string | null; email: string | null; phone: string | null };
  job: { title: string; company: string };
  generatedAt: Date;
}): string {
  const contact = [input.candidate.location, input.candidate.email, input.candidate.phone].filter(Boolean).map((item) => escapeHtml(item as string)).join(" · ");
  const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "Europe/Warsaw" }).format(input.generatedAt);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
@page{size:A4;margin:22mm 24mm}*{box-sizing:border-box}body{margin:0;color:#172033;font:11.5pt/1.55 Arial,sans-serif}header{border-bottom:2px solid #172033;padding-bottom:12px;margin-bottom:28px}h1{font-size:21pt;line-height:1.1;margin:0 0 5px}header p{margin:2px 0;color:#4b5565}.meta{margin-bottom:26px}.meta p{margin:2px 0}.salutation{margin:0 0 18px}.body p{margin:0 0 15px;text-align:left}.closing{margin-top:25px}.signature{font-weight:700;margin-top:4px}
</style></head><body>
<header><h1>${escapeHtml(input.candidate.name)}</h1>${input.candidate.title ? `<p>${escapeHtml(input.candidate.title)}</p>` : ""}${contact ? `<p>${contact}</p>` : ""}</header>
<section class="meta"><p>${escapeHtml(date)}</p><p><strong>${escapeHtml(input.job.company)}</strong></p><p>${escapeHtml(input.job.title)}</p></section>
<p class="salutation">${escapeHtml(input.content.salutation)}</p>
<main class="body">${input.content.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}</main>
<section class="closing"><p>${escapeHtml(input.content.signOff)}</p><p class="signature">${escapeHtml(input.candidate.name)}</p></section>
</body></html>`;
}
