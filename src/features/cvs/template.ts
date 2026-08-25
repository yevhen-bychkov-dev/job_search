import type { CandidateProfile } from "@/features/knowledge/candidate-profile";

import type { GeneratedCvContent } from "./types";

export const MAX_RESUME_TEMPLATE_BYTES = 256 * 1024;
export const RESUME_TEMPLATE_MIME_TYPE = "text/html";
const RESUME_PRINT_PAGINATION_STYLE = `<style data-resume-print-pagination>@media print{.resume{-webkit-box-decoration-break:clone;box-decoration-break:clone;}}</style>`;
const SUPPORTED_TOKENS = new Set([
  "resume.name", "resume.title", "resume.location", "resume.email", "resume.phone", "resume.links",
  "resume.linkedin", "resume.github", "resume.headline", "resume.summary", "resume.professional_summary",
  "resume.selected_impact", "resume.skills", "resume.skill_groups", "resume.experience", "resume.education",
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
  if (/<\s*script\b|<\s*iframe\b|<\s*object\b|<\s*embed\b|<\s*base\b|<\s*form\b|<\s*(?:video|audio)\b|<\s*link\b[^>]*\bhref\s*=|<\s*img\b[^>]*\bsrc\s*=|<\s*meta\b[^>]*\bhttp-equiv\s*=|\bon[a-z]+\s*=|javascript\s*:|data\s*:/i.test(value)) return "Templates cannot contain scripts, event handlers, executable URLs, or embedded objects.";
  if (/@import\b|url\s*\(/i.test(value)) return "Templates cannot import remote styles or assets.";
  if (!hasBalancedTags(value)) return "The HTML template has unbalanced tags.";
  const tokens = [...value.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((match) => match[1].trim());
  const unsupportedToken = tokens.find((token) => !SUPPORTED_TOKENS.has(token));
  if (unsupportedToken) return `The template contains unsupported placeholder "{{${unsupportedToken}}}". Use the documented resume.* placeholders.`;
  const legacyMarkers = [...value.matchAll(/<!--\s*([A-Z][A-Z0-9_]+)\s*-->/g)].map((match) => match[1]);
  const unsupportedMarker = legacyMarkers.find((marker) => marker !== "SELECTED_IMPACT_ITEMS" && marker !== "SKILL_GROUPS" && !marker.endsWith("_BULLETS"));
  if (unsupportedMarker) return `The template contains unsupported resume marker "${unsupportedMarker}".`;
  if (!tokens.includes("resume.name") || (!tokens.includes("resume.experience") && !legacyMarkers.some((marker) => marker.endsWith("_BULLETS")))) return "The template must include {{resume.name}} and either {{resume.experience}} or legacy *_BULLETS markers.";
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

const RESUME_SKILL_CATEGORIES = [
  {
    title: "Frontend",
    skills: [
      "react", "next.js", "typescript", "javascript", "html", "css", "sass", "css in js", "coffeescript",
      "material ui", "ant design", "storybook", "react virtuoso", "browser apis", "accessibility",
      "internationalization", "localization", "responsive design", "web performance", "microfrontends",
      "react hooks", "react hook form", "formik",
    ],
  },
  {
    title: "State, data and integrations",
    skills: [
      "redux", "tanstack query", "react context", "axios", "rest apis", "websockets", "graphql", "auth0", "okta",
      "feature flags", "a b testing", "api contracts",
    ],
  },
  {
    title: "Testing and quality",
    skills: ["jest", "react testing library", "playwright", "sonarqube", "snyk", "dependabot"],
  },
  {
    title: "AI product integrations",
    skills: ["vercel ai sdk", "sse", "tool calling", "ai streaming"],
  },
  {
    title: "AI-assisted engineering",
    skills: ["cursor", "codex", "github copilot", "claude code"],
  },
  {
    title: "Build and tooling",
    skills: ["webpack", "vite", "lerna", "yarn", "git", "github actions"],
  },
  {
    title: "Observability and delivery",
    skills: ["grafana", "production debugging", "incident management", "release management", "linux"],
  },
  {
    title: "Backend foundation",
    skills: [
      "node.js", "express", "moleculer.js", "microservices", "mysql", "sequelize", "mongodb", "aws s3", "grpc", "buf",
      "google apps script", "google sheets", "telegram bot api", "heroku",
    ],
  },
  {
    title: "Engineering practice",
    skills: ["code review", "technical design", "adrs", "agile"],
  },
] as const;

const RESUME_SKILL_CATEGORY_BY_KEY: ReadonlyMap<string, string> = new Map<string, string>(
  RESUME_SKILL_CATEGORIES.flatMap((category) => category.skills.map((skill) => [skill, category.title] as const)),
);

function resumeSkillKey(skill: string): string {
  return skill
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/^familiar:\s*/, "")
    .replace(/[^\p{L}\p{N}+#.]+/gu, " ")
    .trim();
}

function resumeSkillGroupHtml(title: string, skills: string[]): string {
  return `<div class="skill-group resume-skill-group" style="break-inside: avoid; page-break-inside: avoid; break-after: auto; page-break-after: auto; margin: 0 0 4mm;"><h3 class="skill-title">${escapeHtml(title)}</h3><ul class="bullets resume-skill-list" style="margin: 0; padding-left: 4.4mm;">${skills.map((skill) => `<li>${escapeHtml(skill)}</li>`).join("")}</ul></div>`;
}

function skillGroupsHtml(skills: string[]): string {
  if (skills.length === 0) return "";
  const grouped = new Map<string, string[]>();
  for (const skill of skills) {
    const title = RESUME_SKILL_CATEGORY_BY_KEY.get(resumeSkillKey(skill)) ?? "Additional relevant skills";
    const categorySkills = grouped.get(title) ?? [];
    categorySkills.push(skill);
    grouped.set(title, categorySkills);
  }
  const orderedGroups = [
    ...RESUME_SKILL_CATEGORIES.flatMap((category) => {
      const categorySkills = grouped.get(category.title);
      return categorySkills ? [{ title: category.title, skills: categorySkills }] : [];
    }),
    ...(grouped.has("Additional relevant skills")
      ? [{ title: "Additional relevant skills", skills: grouped.get("Additional relevant skills") ?? [] }]
      : []),
  ];
  const columnCount = orderedGroups.length > 1 ? 2 : 1;
  return `<div class="resume-skill-columns" style="grid-column: 1 / -1; column-count: ${columnCount}; column-gap: 12mm; column-fill: balance; break-inside: avoid; page-break-inside: avoid; break-after: auto; page-break-after: auto;">${orderedGroups.map((group) => resumeSkillGroupHtml(group.title, group.skills)).join("")}</div>`;
}

function experienceHtml(content: GeneratedCvContent): string {
  return content.experience.map((experience) => `<section class="resume-experience-item"><h3>${escapeHtml(experience.role)} · ${escapeHtml(experience.company)}</h3><p class="resume-dates">${escapeHtml(dateRange(experience.startDate, experience.endDate))}</p><ul>${experience.achievements.map((achievement) => `<li>${escapeHtml(achievement)}</li>`).join("")}</ul></section>`).join("");
}

function educationHtml(content: GeneratedCvContent): string {
  return content.education.map((education) => `<section class="resume-education-item"><h3>${escapeHtml(education.degree ?? education.institution)}</h3><p>${escapeHtml(education.institution)}${education.startDate || education.endDate ? ` · ${escapeHtml(dateRange(education.startDate, education.endDate))}` : ""}</p></section>`).join("");
}

function selectedImpactHtml(content: GeneratedCvContent): string {
  return content.experience
    .flatMap((experience) => experience.achievements)
    .slice(0, 4)
    .map((achievement) => `<li>${escapeHtml(achievement)}</li>`)
    .join("");
}

function linkValue(links: Record<string, string>, label: string): string {
  const entry = Object.entries(links).find(([candidate]) => candidate.toLocaleLowerCase("en") === label.toLocaleLowerCase("en"));
  return entry ? escapeHtml(entry[1]) : "";
}

function legacyExperienceMarkers(html: string, content: GeneratedCvContent): string {
  const used = new Set<number>();
  let fallbackIndex = 0;
  return html.replace(/<!--\s*([A-Z][A-Z0-9_]*)_BULLETS\s*-->/g, (_match, marker: string) => {
    const markerKey = marker.toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, "");
    let index = content.experience.findIndex((experience, candidateIndex) => {
      const companyKey = experience.company.toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, "");
      return !used.has(candidateIndex) && (companyKey.includes(markerKey) || markerKey.includes(companyKey));
    });
    while (index < 0 && fallbackIndex < content.experience.length && used.has(fallbackIndex)) fallbackIndex += 1;
    if (index < 0 && fallbackIndex < content.experience.length) index = fallbackIndex;
    if (index < 0) return "";
    used.add(index);
    return content.experience[index].achievements.map((achievement) => `<li>${escapeHtml(achievement)}</li>`).join("");
  });
}

function withPrintPaginationSafeguard(html: string): string {
  if (/<\/head\s*>/i.test(html)) {
    return html.replace(/<\/head\s*>/i, `${RESUME_PRINT_PAGINATION_STYLE}</head>`);
  }
  return `${RESUME_PRINT_PAGINATION_STYLE}${html}`;
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
    // Uploaded templates commonly use resume.title for the top heading. The
    // vacancy-specific generated headline must win over the profile default.
    "resume.title": escapeHtml(input.content.headline ?? input.personal.title ?? ""),
    "resume.location": escapeHtml(input.personal.location ?? ""),
    "resume.email": escapeHtml(input.personal.email ?? ""),
    "resume.phone": escapeHtml(input.personal.phone ?? ""),
    "resume.links": linksHtml(input.personal.links),
    "resume.linkedin": linkValue(input.personal.links, "LinkedIn"),
    "resume.github": linkValue(input.personal.links, "GitHub"),
    "resume.headline": escapeHtml(input.content.headline ?? ""),
    "resume.summary": escapeHtml(input.content.summary ?? ""),
    "resume.professional_summary": escapeHtml(input.content.summary ?? ""),
    "resume.selected_impact": selectedImpactHtml(input.content),
    "resume.skills": skillsHtml(input.content.skills),
    "resume.skill_groups": skillGroupsHtml(input.content.skills),
    "resume.experience": experienceHtml(input.content),
    "resume.education": educationHtml(input.content),
  };
  let rendered = templateHtml.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, token: string) => values[token.trim()] ?? "");
  rendered = rendered.replace(/<!--\s*SELECTED_IMPACT_ITEMS\s*-->/g, selectedImpactHtml(input.content));
  rendered = rendered.replace(/<!--\s*SKILL_GROUPS\s*-->/g, skillGroupsHtml(input.content.skills));
  rendered = legacyExperienceMarkers(rendered, input.content);
  if (/\{\{[^}]+\}\}/.test(rendered) || /<!--\s*(?:SELECTED_IMPACT_ITEMS|SKILL_GROUPS|[A-Z][A-Z0-9_]*_BULLETS)\s*-->/.test(rendered)) throw new Error("The HTML template contains an unresolved resume placeholder.");
  return withPrintPaginationSafeguard(rendered);
}

export function isResumeTemplateMetadata(value: unknown): value is { originalName: string; mimeType: string } {
  return isRecord(value) && typeof value.originalName === "string" && typeof value.mimeType === "string";
}
