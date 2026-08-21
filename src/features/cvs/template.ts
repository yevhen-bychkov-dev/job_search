import type { CandidateProfile } from "@/features/knowledge/candidate-profile";

import type { GeneratedCvContent } from "./types";

export const MAX_RESUME_TEMPLATE_BYTES = 256 * 1024;
export const RESUME_TEMPLATE_MIME_TYPE = "text/html";
const SUPPORTED_TOKENS = new Set([
  "resume.name", "resume.title", "resume.location", "resume.email", "resume.phone", "resume.links",
  "resume.headline", "resume.summary", "resume.skills", "resume.experience", "resume.education",
]);
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function safeUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function hasBalancedTags(html: string): boolean {
  const stack: string[] = [];
  const tags = /<\/?([a-z][a-z0-9-]*)\b[^>]*>/gi;
  for (const match of html.matchAll(tags)) {
    const full = match[0];
    const name = match[1].toLocaleLowerCase("en");
    if (full.startsWith("</")) {
      if (stack.pop() !== name) return false;
    } else if (!full.endsWith("/>") && !VOID_TAGS.has(name)) {
      stack.push(name);
    }
  }
  return stack.length === 0;
}

export function validateResumeTemplateText(value: string): string {
  if (!value.trim()) return "The HTML template is empty.";
  if (new TextEncoder().encode(value).byteLength > MAX_RESUME_TEMPLATE_BYTES) return "HTML templates must be 256 KB or smaller.";
  if (/<\s*script\b|<\s*iframe\b|<\s*object\b|<\s*embed\b|<\s*base\b|<\s*form\b|<\s*(?:video|audio)\b|<\s*link\b[^>]*\bhref\s*=|<\s*img\b[^>]*\bsrc\s*=|<\s*meta\b[^>]*\bhttp-equiv\s*=|on[a-z]+\s*=|javascript\s*:|data\s*:/i.test(value)) return "Templates cannot contain scripts, event handlers, executable URLs, or embedded objects.";
  if (/@import\b|url\s*\(/i.test(value)) return "Templates cannot import remote styles or assets.";
  if (!hasBalancedTags(value)) return "The HTML template has unbalanced tags.";
  const tokens = [...value.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((match) => match[1].trim());
  if (!tokens.every((token) => SUPPORTED_TOKENS.has(token))) return "The template contains an unsupported placeholder.";
  if (!tokens.includes("resume.name") || !tokens.includes("resume.experience")) return "The template must include {{resume.name}} and {{resume.experience}}.";
  return "";
}

export function validateResumeTemplateBytes(bytes: Uint8Array): { ok: true; html: string } | { ok: false; message: string } {
  if (bytes.byteLength === 0) return { ok: false, message: "The HTML template is empty." };
  if (bytes.byteLength > MAX_RESUME_TEMPLATE_BYTES) return { ok: false, message: "HTML templates must be 256 KB or smaller." };
  try {
    const html = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const message = validateResumeTemplateText(html);
    return message ? { ok: false, message } : { ok: true, html };
  } catch {
    return { ok: false, message: "The HTML template must be valid UTF-8." };
  }
}

function dateRange(start: string | null, end: string | null): string {
  if (!start && !end) return "";
  if (!start) return end ?? "";
  return `${start} – ${end ?? "Present"}`;
}

function linksHtml(links: Record<string, string>): string {
  return Object.entries(links).flatMap(([label, value]) => {
    const url = safeUrl(value);
    return url ? [`<a href="${escapeHtml(url)}" rel="noreferrer">${escapeHtml(label)}</a>`] : [];
  }).join(" · ");
}

function skillsHtml(skills: string[]): string {
  return `<ul class="resume-skills">${skills.map((skill) => `<li>${escapeHtml(skill)}</li>`).join("")}</ul>`;
}

function experienceHtml(content: GeneratedCvContent): string {
  return content.experience.map((experience) => `<section class="resume-experience-item"><h3>${escapeHtml(experience.role)} · ${escapeHtml(experience.company)}</h3><p class="resume-dates">${escapeHtml(dateRange(experience.startDate, experience.endDate))}</p><ul>${experience.achievements.map((achievement) => `<li>${escapeHtml(achievement)}</li>`).join("")}</ul></section>`).join("");
}

function educationHtml(content: GeneratedCvContent): string {
  return content.education.map((education) => `<section class="resume-education-item"><h3>${escapeHtml(education.degree ?? education.institution)}</h3><p>${escapeHtml(education.institution)}${education.startDate || education.endDate ? ` · ${escapeHtml(dateRange(education.startDate, education.endDate))}` : ""}</p></section>`).join("");
}

export type ResumeTemplateRenderInput = {
  personal: CandidateProfile["personal"];
  content: GeneratedCvContent;
};

export function renderResumeTemplate(templateHtml: string, input: ResumeTemplateRenderInput): string {
  const validation = validateResumeTemplateText(templateHtml);
  if (validation) throw new Error(validation);
  const values: Record<string, string> = {
    "resume.name": escapeHtml(input.personal.name),
    "resume.title": escapeHtml(input.personal.title ?? ""),
    "resume.location": escapeHtml(input.personal.location ?? ""),
    "resume.email": escapeHtml(input.personal.email ?? ""),
    "resume.phone": escapeHtml(input.personal.phone ?? ""),
    "resume.links": linksHtml(input.personal.links),
    "resume.headline": escapeHtml(input.content.headline ?? ""),
    "resume.summary": escapeHtml(input.content.summary ?? ""),
    "resume.skills": skillsHtml(input.content.skills),
    "resume.experience": experienceHtml(input.content),
    "resume.education": educationHtml(input.content),
  };
  const rendered = templateHtml.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, token: string) => values[token.trim()] ?? "");
  if (/\{\{[^}]+\}\}/.test(rendered)) throw new Error("The HTML template contains an unresolved placeholder.");
  return rendered;
}

export function isResumeTemplateMetadata(value: unknown): value is { originalName: string; mimeType: string } {
  return isRecord(value) && typeof value.originalName === "string" && typeof value.mimeType === "string";
}
