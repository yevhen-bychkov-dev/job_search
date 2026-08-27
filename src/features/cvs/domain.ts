import type { CandidateProfile } from "@/features/knowledge/candidate-profile";

import { JOB_REQUIREMENT_LEVELS, VACANCY_REQUIREMENT_SECTIONS } from "./types.ts";
import type {
  ApprovedResumeSkill,
  CvFitAssessmentContent,
  GeneratedCvContent,
  JobRequirementLevel,
  JobResumeRequirements,
  SavedJobRequirement,
  VacancyAnalysis,
  VacancyRequirement,
  VacancyRequirementSection,
} from "./types";
import type { VacancyAiJob } from "./ai/provider";

type ParseResult<T> = { ok: true; data: T } | { ok: false; message: string };

type SkillSuggestion = Pick<VacancyRequirement, "label" | "category" | "importance">;
type SkillSuggestionResult = {
  skills: SkillSuggestion[];
  senioritySignals: string[];
  atsKeywords: string[];
  employerTerminology: string[];
};

const REQUIREMENT_CATEGORIES: VacancyRequirement["category"][] = [
  "technical", "tooling", "architecture", "domain", "responsibility", "ownership", "collaboration", "leadership",
];
export const REQUIREMENT_SECTIONS = VACANCY_REQUIREMENT_SECTIONS;
const MAX_REQUIREMENT_EVIDENCE_LENGTH = 1200;

function filenamePart(value: string, fallback: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/\p{Mark}+/gu, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "")
    .slice(0, 70);
  return normalized || fallback;
}

export function generatedCvFilename(candidateName: string, companyName: string): string {
  return `${filenamePart(candidateName, "Candidate")}_${filenamePart(companyName, "Company")}_CV.pdf`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = new Set(allowed);
  return Object.keys(record).every((key) => keys.has(key));
}

function normalized(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}+#.]+/gu, " ").trim();
}

function stringList(value: unknown, field: string, maximumItems: number, maximumItemLength = 160): ParseResult<string[]> {
  if (!Array.isArray(value) || value.length > maximumItems) return { ok: false, message: `${field} is invalid.` };
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") return { ok: false, message: `${field} is invalid.` };
    const text = item.trim();
    const key = normalized(text);
    if (!text || text.length > maximumItemLength || !key || seen.has(key)) return { ok: false, message: `${field} is invalid or contains duplicates.` };
    seen.add(key);
    result.push(text);
  }
  return { ok: true, data: result };
}

function stableRequirementKey(label: string): string {
  return label
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "requirement";
}

function uniqueRequirementKey(label: string, used: Set<string>): string {
  const base = stableRequirementKey(label);
  if (!used.has(base)) return base;
  let hash = 2166136261;
  for (const character of label) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  const suffix = (hash >>> 0).toString(36);
  return `${base.slice(0, Math.max(1, 119 - suffix.length))}-${suffix}`;
}

export function parseSkillSuggestionResult(value: unknown): ParseResult<SkillSuggestionResult> {
  const fields = ["skills", "senioritySignals", "atsKeywords", "employerTerminology"] as const;
  if (!isRecord(value) || !hasOnlyKeys(value, fields) || !Array.isArray(value.skills) || value.skills.length < 1 || value.skills.length > 80) {
    return { ok: false, message: "The model skill suggestions have an invalid structure." };
  }
  const skills: SkillSuggestion[] = [];
  const labels = new Set<string>();
  for (const item of value.skills) {
    if (!isRecord(item) || !hasOnlyKeys(item, ["label", "category", "importance"])) return { ok: false, message: "A model skill suggestion is invalid." };
    const label = typeof item.label === "string" ? item.label.trim() : "";
    const labelKey = normalized(label);
    if (!label || label.length > 160 || !labelKey || labels.has(labelKey) || !REQUIREMENT_CATEGORIES.includes(item.category as VacancyRequirement["category"]) || !["must_have", "nice_to_have"].includes(String(item.importance))) {
      return { ok: false, message: "A model skill suggestion has an invalid label, category, importance, or duplicate." };
    }
    labels.add(labelKey);
    skills.push({ label, category: item.category as VacancyRequirement["category"], importance: item.importance as VacancyRequirement["importance"] });
  }
  const senioritySignals = stringList(value.senioritySignals, "senioritySignals", 20, 240);
  const atsKeywords = stringList(value.atsKeywords, "atsKeywords", 50, 120);
  const employerTerminology = stringList(value.employerTerminology, "employerTerminology", 50, 160);
  if (!senioritySignals.ok) return senioritySignals;
  if (!atsKeywords.ok) return atsKeywords;
  if (!employerTerminology.ok) return employerTerminology;
  return { ok: true, data: { skills, senioritySignals: senioritySignals.data, atsKeywords: atsKeywords.data, employerTerminology: employerTerminology.data } };
}

function phraseMentioned(haystack: string, needle: string): boolean {
  const source = normalized(haystack);
  const target = normalized(needle);
  if (!source || !target) return false;
  return source === target || ` ${source} `.includes(` ${target} `);
}

function mergeSuggestions(raw: SkillSuggestion[], job: VacancyAiJob, profile: CandidateProfile): SkillSuggestion[] {
  const merged = new Map<string, SkillSuggestion>();
  for (const skill of raw) merged.set(normalized(skill.label), skill);
  for (const technology of job.technologies) {
    const label = technology.trim();
    if (label) merged.set(normalized(label), { label, category: "technical", importance: "must_have" });
  }
  const vacancyText = [job.title, job.description, ...job.technologies].join(" ");
  for (const skill of profile.skills) {
    if (phraseMentioned(vacancyText, skill) && !merged.has(normalized(skill))) {
      merged.set(normalized(skill), { label: skill, category: "technical", importance: "nice_to_have" });
    }
  }
  return [...merged.values()].slice(0, 80);
}

function emptyAnalysis(input: SkillSuggestionResult, job: VacancyAiJob): VacancyAnalysis {
  return {
    mustHaveTechnical: [], niceToHaveTechnical: [], tooling: [], architecture: [], domainKnowledge: [], responsibilities: [], ownershipExpectations: [],
    senioritySignals: input.senioritySignals,
    collaborationExpectations: [], leadershipExpectations: [],
    atsKeywords: [...new Set([job.title, ...job.technologies, ...input.atsKeywords].map((value) => value.trim()).filter(Boolean))].slice(0, 100),
    employerTerminology: input.employerTerminology,
  };
}

function sectionForSuggestion(skill: SkillSuggestion): VacancyRequirementSection {
  if (skill.category === "technical") return skill.importance === "must_have" ? "mustHaveTechnical" : "niceToHaveTechnical";
  if (skill.category === "tooling") return "tooling";
  if (skill.category === "architecture") return "architecture";
  if (skill.category === "domain") return "domainKnowledge";
  if (skill.category === "responsibility") return "responsibilities";
  if (skill.category === "ownership") return "ownershipExpectations";
  if (skill.category === "collaboration") return "collaborationExpectations";
  return "leadershipExpectations";
}

export function materializeVacancyAnalysis(raw: unknown, job: VacancyAiJob, profile: CandidateProfile): ParseResult<VacancyAnalysis> {
  const parsed = parseSkillSuggestionResult(raw);
  if (!parsed.ok) return parsed;
  const analysis = emptyAnalysis(parsed.data, job);
  const usedKeys = new Set<string>();
  for (const skill of mergeSuggestions(parsed.data.skills, job, profile)) {
    const key = uniqueRequirementKey(skill.label, usedKeys);
    usedKeys.add(key);
    analysis[sectionForSuggestion(skill)].push({ ...skill, key, status: "unconfirmed", evidence: [] });
  }
  return { ok: true, data: matchVacancyAnalysis(analysis, profile) };
}

function statusForRequirementLevel(level: JobRequirementLevel): VacancyRequirement["status"] {
  if (level === "commercial") return "supported";
  if (level === "familiar") return "confirmed_familiar";
  if (level === "none") return "confirmed_none";
  return "unconfirmed";
}

function levelForRequirementStatus(status: VacancyRequirement["status"]): JobRequirementLevel {
  if (status === "supported") return "commercial";
  if (status === "confirmed_familiar") return "familiar";
  if (status === "confirmed_none") return "none";
  return "unconfirmed";
}

export function savedJobRequirementsFromAnalysis(analysis: VacancyAnalysis): SavedJobRequirement[] {
  return REQUIREMENT_SECTIONS.flatMap((section) => analysis[section].map((requirement) => ({
    ...requirement,
    section,
    level: levelForRequirementStatus(requirement.status),
    source: "ai" as const,
  })));
}

export function recoverSavedJobRequirementsFromAnalysis(analysis: VacancyAnalysis): SavedJobRequirement[] {
  const labels = new Set<string>();
  return savedJobRequirementsFromAnalysis(analysis).filter((requirement) => {
    const label = normalized(requirement.label);
    if (!label || labels.has(label)) return false;
    labels.add(label);
    return true;
  });
}

export function savedJobRequirementsToAnalysis(saved: JobResumeRequirements): VacancyAnalysis {
  const analysis = structuredClone(saved.analysis);
  for (const section of REQUIREMENT_SECTIONS) {
    analysis[section] = saved.requirements
      .filter((requirement) => requirement.section === section)
      .map((requirement) => ({ key: requirement.key, label: requirement.label, category: requirement.category, importance: requirement.importance, status: statusForRequirementLevel(requirement.level), evidence: [...requirement.evidence] }));
  }
  return analysis;
}

export function validateSavedJobRequirements(value: unknown): ParseResult<SavedJobRequirement[]> {
  if (!Array.isArray(value) || value.length > 80) return { ok: false, message: "The approved skills list is invalid." };
  const keys = new Set<string>();
  const labels = new Set<string>();
  const result: SavedJobRequirement[] = [];
  for (const item of value) {
    if (!isRecord(item)) return { ok: false, message: "The approved skills list is invalid." };
    const key = typeof item.key === "string" ? item.key.trim() : "";
    const label = typeof item.label === "string" ? item.label.trim() : "";
    const labelKey = normalized(label);
    const section = item.section as VacancyRequirementSection;
    const category = item.category as VacancyRequirement["category"];
    const importance = item.importance;
    const level = item.level as JobRequirementLevel;
    if (!/^[a-z0-9-]{1,120}$/.test(key) || !label || label.length > 160 || !labelKey || !REQUIREMENT_SECTIONS.includes(section) || !REQUIREMENT_CATEGORIES.includes(category) || !["must_have", "nice_to_have"].includes(String(importance)) || !JOB_REQUIREMENT_LEVELS.includes(level)) {
      return { ok: false, message: "Each approved skill must have a valid label, category, importance, and experience level." };
    }
    if (keys.has(key) || labels.has(labelKey)) return { ok: false, message: "The approved skills list contains duplicates." };
    keys.add(key);
    labels.add(labelKey);
    if (!Array.isArray(item.evidence) || item.evidence.length > 10 || !item.evidence.every((entry) => typeof entry === "string" && entry.length > 0 && entry.length <= MAX_REQUIREMENT_EVIDENCE_LENGTH)) {
      return { ok: false, message: "Approved skill evidence is invalid." };
    }
    result.push({ key, label, section, category, importance: importance as VacancyRequirement["importance"], level, source: item.source === "user" ? "user" : "ai", status: statusForRequirementLevel(level), evidence: [...item.evidence] as string[] });
  }
  return { ok: true, data: result };
}

function parseStoredRequirement(value: unknown): ParseResult<VacancyRequirement> {
  if (!isRecord(value) || !hasOnlyKeys(value, ["key", "label", "category", "importance", "status", "evidence"])) return { ok: false, message: "Stored vacancy analysis is invalid." };
  const key = typeof value.key === "string" ? value.key : "";
  const label = typeof value.label === "string" ? value.label.trim() : "";
  const status = value.status as VacancyRequirement["status"];
  if (!/^[a-z0-9-]{1,120}$/.test(key) || !label || label.length > 160 || !REQUIREMENT_CATEGORIES.includes(value.category as VacancyRequirement["category"]) || !["must_have", "nice_to_have"].includes(String(value.importance)) || !["supported", "unconfirmed", "confirmed_familiar", "confirmed_none"].includes(String(status))) return { ok: false, message: "Stored vacancy analysis is invalid." };
  if (!Array.isArray(value.evidence) || value.evidence.length > 10 || !value.evidence.every((entry) => typeof entry === "string" && entry.length > 0 && entry.length <= MAX_REQUIREMENT_EVIDENCE_LENGTH)) return { ok: false, message: "Stored vacancy evidence is invalid." };
  return { ok: true, data: { key, label, category: value.category as VacancyRequirement["category"], importance: value.importance as VacancyRequirement["importance"], status, evidence: [...value.evidence] as string[] } };
}

export function parseVacancyAnalysis(value: unknown): ParseResult<VacancyAnalysis> {
  const fields = [...REQUIREMENT_SECTIONS, "senioritySignals", "atsKeywords", "employerTerminology"] as const;
  if (!isRecord(value) || !hasOnlyKeys(value, fields)) return { ok: false, message: "Stored vacancy analysis contains unsupported fields." };
  const analysis = {
    mustHaveTechnical: [], niceToHaveTechnical: [], tooling: [], architecture: [], domainKnowledge: [], responsibilities: [], ownershipExpectations: [], collaborationExpectations: [], leadershipExpectations: [],
  } as Pick<VacancyAnalysis, VacancyRequirementSection>;
  const allKeys = new Set<string>();
  for (const section of REQUIREMENT_SECTIONS) {
    const list = value[section];
    if (!Array.isArray(list) || list.length > 80) return { ok: false, message: `Stored vacancy analysis ${section} is invalid.` };
    for (const item of list) {
      const parsed = parseStoredRequirement(item);
      if (!parsed.ok || allKeys.has(parsed.data.key)) return parsed.ok ? { ok: false, message: "Stored vacancy analysis contains duplicate requirements." } : parsed;
      allKeys.add(parsed.data.key);
      analysis[section].push(parsed.data);
    }
  }
  const senioritySignals = stringList(value.senioritySignals, "senioritySignals", 30, 240);
  const atsKeywords = stringList(value.atsKeywords, "atsKeywords", 100, 120);
  const employerTerminology = stringList(value.employerTerminology, "employerTerminology", 100, 160);
  if (!senioritySignals.ok) return senioritySignals;
  if (!atsKeywords.ok) return atsKeywords;
  if (!employerTerminology.ok) return employerTerminology;
  return { ok: true, data: { ...analysis, senioritySignals: senioritySignals.data, atsKeywords: atsKeywords.data, employerTerminology: employerTerminology.data } };
}

function evidenceEntries(profile: CandidateProfile): Array<{ searchable: string; display: string }> {
  return [
    ...profile.skills.map((skill) => ({ searchable: skill, display: skill })),
    ...profile.experience.flatMap((experience) => [
      ...experience.technologies.map((technology) => ({ searchable: technology, display: technology })),
      ...experience.achievements.flatMap((achievement) => [
        ...achievement.skills.map((skill) => ({ searchable: skill, display: achievement.text })),
        { searchable: achievement.text, display: achievement.text },
      ]),
    ]),
  ];
}

export function matchVacancyAnalysis(analysis: VacancyAnalysis, profile: CandidateProfile, approvedSkills: readonly ApprovedResumeSkill[] = []): VacancyAnalysis {
  const evidence = evidenceEntries(profile);
  const approvalByKey = new Map(approvedSkills.map((skill) => [skill.key, skill]));
  const matched = structuredClone(analysis);
  for (const section of REQUIREMENT_SECTIONS) {
    matched[section] = analysis[section].map((requirement) => {
      const explicit = approvalByKey.get(requirement.key);
      const matches = evidence.filter((entry) => phraseMentioned(entry.searchable, requirement.label));
      const status = explicit?.level === "commercial" || matches.length > 0
        ? "supported"
        : explicit?.level === "familiar"
          ? "confirmed_familiar"
          : explicit?.level === "none"
            ? "confirmed_none"
            : "unconfirmed";
      return { ...requirement, status, evidence: [...new Set(matches.map((entry) => entry.display))].slice(0, 3) };
    });
  }
  return matched;
}

export function validateRequirementApproval(requirements: readonly SavedJobRequirement[]): string {
  if (requirements.length === 0) return "Keep at least one relevant skill before approval.";
  if (requirements.some((requirement) => requirement.level === "unconfirmed")) return "Choose an experience level for every skill, or remove skills that should not be used.";
  if (!requirements.some((requirement) => requirement.level === "commercial" || requirement.level === "familiar")) return "Approve at least one commercial or familiar skill for resume generation.";
  return "";
}

export function approvedSkillsFromRequirements(requirements: readonly SavedJobRequirement[]): ApprovedResumeSkill[] {
  return requirements
    .filter((requirement) => requirement.level !== "unconfirmed")
    .map((requirement) => ({
      key: requirement.key,
      label: requirement.label,
      level: requirement.level as ApprovedResumeSkill["level"],
      provenance: requirement.evidence.length > 0 && requirement.level === "commercial" ? "existing_kb" : "explicit_user_confirmation",
    }));
}

export function approvedSkillSnapshotsEqual(left: readonly ApprovedResumeSkill[], right: readonly ApprovedResumeSkill[]): boolean {
  const comparable = (values: readonly ApprovedResumeSkill[]) => [...values]
    .map(({ key, label, level, provenance }) => ({ key, label, level, provenance }))
    .sort((a, b) => a.key.localeCompare(b.key));
  return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
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

function candidateEvidence(profile: CandidateProfile): string[] {
  return [
    profile.personal.title ?? "", profile.summary ?? "", ...profile.skills,
    ...profile.experience.flatMap((experience) => [experience.role, ...experience.technologies, ...experience.achievements.map((achievement) => achievement.text)]),
    ...profile.education.flatMap((education) => [education.degree ?? "", education.institution]),
  ].filter(Boolean);
}

export function materializeResumeContent(profile: CandidateProfile, value: unknown, approvedSkills: readonly ApprovedResumeSkill[]): ParseResult<GeneratedCvContent> {
  if (!isRecord(value) || !hasOnlyKeys(value, ["headline", "summary", "skills", "selectedImpact", "experience", "educationIds"])) return { ok: false, message: "The model resume contains unsupported fields." };
  const headline = value.headline === null ? null : typeof value.headline === "string" && value.headline.trim().length > 0 && value.headline.length <= 160 ? value.headline.trim() : null;
  const summary = value.summary === null ? null : typeof value.summary === "string" && value.summary.trim().length > 0 && value.summary.length <= 1200 ? value.summary.trim() : null;
  if ((value.headline !== null && headline === null) || (value.summary !== null && summary === null)) return { ok: false, message: "The model resume headline or summary is invalid." };

  const deniedSkills = new Set(approvedSkills.filter((skill) => skill.level === "none").map((skill) => normalized(skill.label)));
  const commercialSkills = new Set([
    ...profile.skills,
    ...profile.experience.flatMap((experience) => experience.technologies),
    ...approvedSkills.filter((skill) => skill.level === "commercial").map((skill) => skill.label),
  ].map(normalized).filter((skill) => !deniedSkills.has(skill)));
  const familiarSkills = new Set(approvedSkills.filter((skill) => skill.level === "familiar").map((skill) => normalized(`Familiar: ${skill.label}`)));
  const parsedSkills = stringList(value.skills, "resume skills", 40, 100);
  const educationIds = stringList(value.educationIds, "resume education", 20, 64);
  if (!parsedSkills.ok) return parsedSkills;
  if (!educationIds.ok) return educationIds;
  const skills: string[] = [];
  const seenSkills = new Set<string>();
  const addSkill = (skill: string) => {
    const key = normalized(skill);
    if (!key || seenSkills.has(key)) return;
    seenSkills.add(key);
    skills.push(skill);
  };
  for (const skill of parsedSkills.data) {
    const key = normalized(skill);
    if (commercialSkills.has(key) || familiarSkills.has(key)) addSkill(skill);
  }
  for (const approved of approvedSkills) {
    if (approved.level === "commercial") addSkill(approved.label);
    if (approved.level === "familiar") addSkill(`Familiar: ${approved.label}`);
  }

  const experienceById = new Map(profile.experience.map((experience) => [experience.id, experience]));
  if (!Array.isArray(value.selectedImpact) || value.selectedImpact.length > 4) return { ok: false, message: "The model Selected Impact is invalid." };
  const selectedImpact: string[] = [];
  const selectedImpactText = new Set<string>();
  for (const item of value.selectedImpact) {
    if (!isRecord(item) || !hasOnlyKeys(item, ["text", "sources"]) || typeof item.text !== "string" || item.text.trim().length < 10 || item.text.length > 600 || /<[a-z][^>]*>/i.test(item.text) || !Array.isArray(item.sources) || item.sources.length < 1 || item.sources.length > 8) return { ok: false, message: "A Selected Impact statement is invalid." };
    const sourceText: string[] = [];
    const sourceKeys = new Set<string>();
    for (const reference of item.sources) {
      if (!isRecord(reference) || !hasOnlyKeys(reference, ["experienceId", "achievementId"]) || typeof reference.experienceId !== "string" || typeof reference.achievementId !== "string") return { ok: false, message: "Every Selected Impact statement must cite verified achievements." };
      const source = experienceById.get(reference.experienceId)?.achievements.find((achievement) => achievement.id === reference.achievementId);
      const sourceKey = `${reference.experienceId}:${reference.achievementId}`;
      if (!source || sourceKeys.has(sourceKey)) return { ok: false, message: "Every Selected Impact statement must cite distinct verified achievements." };
      sourceKeys.add(sourceKey);
      sourceText.push(source.text);
    }
    const text = item.text.trim();
    const textKey = normalized(text);
    const evidence = sourceText.join(" ");
    if (selectedImpactText.has(textKey) || containsUnsupportedClaim(text, evidence) || numbers(text).some((number) => !evidence.includes(number))) continue;
    selectedImpactText.add(textKey);
    selectedImpact.push(text);
  }

  if (!Array.isArray(value.experience) || value.experience.length < 1 || value.experience.length > profile.experience.length) return { ok: false, message: "The model experience selection is invalid." };
  const selected = new Set<string>();
  const usedAchievementIds = new Set<string>();
  const experience: GeneratedCvContent["experience"] = [];
  for (const item of value.experience) {
    if (!isRecord(item) || !hasOnlyKeys(item, ["experienceId", "bullets"]) || typeof item.experienceId !== "string" || !Array.isArray(item.bullets) || item.bullets.length < 1 || item.bullets.length > 12 || selected.has(item.experienceId)) return { ok: false, message: "The model experience selection is invalid." };
    const source = experienceById.get(item.experienceId);
    if (!source) return { ok: false, message: "The model selected experience outside the verified profile." };
    selected.add(item.experienceId);
    const sourceById = new Map(source.achievements.map((achievement) => [achievement.id, achievement.text]));
    const achievements: string[] = [];
    for (const bullet of item.bullets) {
      if (!isRecord(bullet) || !hasOnlyKeys(bullet, ["text", "sourceAchievementIds"]) || typeof bullet.text !== "string" || bullet.text.trim().length < 10 || bullet.text.length > 600 || /<[a-z][^>]*>/i.test(bullet.text)) return { ok: false, message: "A model resume bullet is invalid." };
      const sourceIds = stringList(bullet.sourceAchievementIds, "resume bullet sources", 4, 64);
      if (!sourceIds.ok || sourceIds.data.length === 0 || !sourceIds.data.every((id) => sourceById.has(id))) return { ok: false, message: "Every resume bullet must cite verified achievements from the same experience." };
      const achievementKeys = sourceIds.data.map((id) => `${item.experienceId}:${id}`);
      if (achievementKeys.some((key) => usedAchievementIds.has(key))) continue;
      achievementKeys.forEach((key) => usedAchievementIds.add(key));
      const sourceText = sourceIds.data.map((id) => sourceById.get(id) ?? "").join(" ");
      const safeBullet = containsUnsupportedClaim(bullet.text, sourceText) || numbers(bullet.text).some((number) => !sourceText.includes(number)) ? sourceText : bullet.text.trim();
      achievements.push(safeBullet);
    }
    experience.push({ company: source.company, role: source.role, startDate: source.startDate, endDate: source.endDate, technologies: [...source.technologies], achievements });
  }

  const educationById = new Map(profile.education.map((education) => [education.id, education]));
  const education: GeneratedCvContent["education"] = [];
  for (const id of educationIds.data) {
    const source = educationById.get(id);
    if (!source) return { ok: false, message: "The model selected education outside the verified profile." };
    education.push({ institution: source.institution, degree: source.degree, startDate: source.startDate, endDate: source.endDate });
  }
  const allSourceText = candidateEvidence(profile).join(" ");
  const safeHeadline = headline && (containsUnsupportedClaim(headline, allSourceText) || numbers(headline).some((number) => !allSourceText.includes(number))) ? profile.personal.title : headline;
  const safeSummary = summary && (containsUnsupportedClaim(summary, allSourceText) || numbers(summary).some((number) => !allSourceText.includes(number))) ? profile.summary : summary;
  return { ok: true, data: { headline: safeHeadline ?? profile.personal.title, summary: safeSummary, skills, selectedImpact, experience, education } };
}

export function nextCvVersion(versions: readonly number[]): number {
  return versions.reduce((highest, version) => Number.isInteger(version) && version > highest ? version : highest, 0) + 1;
}

export function parseCvFitAssessment(value: unknown): ParseResult<CvFitAssessmentContent> {
  if (!isRecord(value) || !hasOnlyKeys(value, ["fitScore", "summary", "strengths", "gaps"])) {
    return { ok: false, message: "The CV fit assessment has unsupported fields." };
  }
  if (!Number.isInteger(value.fitScore) || (value.fitScore as number) < 0 || (value.fitScore as number) > 10) {
    return { ok: false, message: "The CV fit score must be a whole number from 0 to 10." };
  }
  if (typeof value.summary !== "string" || !value.summary.trim() || value.summary.length > 1200) {
    return { ok: false, message: "The CV fit summary is invalid." };
  }
  const strengths = stringList(value.strengths, "CV fit strengths", 5, 300);
  const gaps = stringList(value.gaps, "CV fit gaps", 5, 300);
  if (!strengths.ok) return strengths;
  if (!gaps.ok) return gaps;
  return {
    ok: true,
    data: {
      fitScore: value.fitScore as number,
      summary: value.summary.trim(),
      strengths: strengths.data,
      gaps: gaps.data,
    },
  };
}

export function parseGeneratedCvContent(value: unknown): ParseResult<GeneratedCvContent> {
  if (!isRecord(value) || !hasOnlyKeys(value, ["headline", "summary", "skills", "selectedImpact", "experience", "education"])) return { ok: false, message: "Stored CV content is invalid." };
  const nullableText = (candidate: unknown, maximum: number) => candidate === null || (typeof candidate === "string" && candidate.trim().length > 0 && candidate.length <= maximum);
  const skills = stringList(value.skills, "skills", 100, 100);
  const selectedImpact = stringList(value.selectedImpact, "selectedImpact", 4, 600);
  if (!nullableText(value.headline, 160) || !nullableText(value.summary, 1200) || !skills.ok || !selectedImpact.ok || !Array.isArray(value.experience) || value.experience.length < 1 || value.experience.length > 20 || !Array.isArray(value.education) || value.education.length > 20) return { ok: false, message: "Stored CV content is invalid." };
  const experience: GeneratedCvContent["experience"] = [];
  for (const item of value.experience) {
    if (!isRecord(item) || !hasOnlyKeys(item, ["company", "role", "startDate", "endDate", "technologies", "achievements"])) return { ok: false, message: "Stored CV experience is invalid." };
    const technologies = stringList(item.technologies, "technologies", 50, 100);
    const achievements = stringList(item.achievements, "achievements", 30, 600);
    if (typeof item.company !== "string" || !item.company.trim() || item.company.length > 160 || typeof item.role !== "string" || !item.role.trim() || item.role.length > 160 || !nullableText(item.startDate, 10) || !nullableText(item.endDate, 10) || !technologies.ok || !achievements.ok || achievements.data.length < 1) return { ok: false, message: "Stored CV experience is invalid." };
    experience.push({ company: item.company, role: item.role, startDate: item.startDate as string | null, endDate: item.endDate as string | null, technologies: technologies.data, achievements: achievements.data });
  }
  const education: GeneratedCvContent["education"] = [];
  for (const item of value.education) {
    if (!isRecord(item) || !hasOnlyKeys(item, ["institution", "degree", "startDate", "endDate"]) || typeof item.institution !== "string" || !item.institution.trim() || item.institution.length > 160 || !nullableText(item.degree, 200) || !nullableText(item.startDate, 10) || !nullableText(item.endDate, 10)) return { ok: false, message: "Stored CV education is invalid." };
    education.push({ institution: item.institution, degree: item.degree as string | null, startDate: item.startDate as string | null, endDate: item.endDate as string | null });
  }
  return { ok: true, data: { headline: value.headline as string | null, summary: value.summary as string | null, skills: skills.data, selectedImpact: selectedImpact.data, experience, education } };
}

function legacyStoredStringList(value: unknown, maximumItems: number): ParseResult<string[]> {
  if (!Array.isArray(value) || value.length > maximumItems || !value.every((item) => typeof item === "string" && item.length > 0 && item.length <= 160)) {
    return { ok: false, message: "Stored legacy CV text list is invalid." };
  }
  if (new Set(value).size !== value.length) return { ok: false, message: "Stored legacy CV text list contains duplicates." };
  return { ok: true, data: value as string[] };
}

function legacyStoredNullableText(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 1200) return undefined;
  return value.trim() || null;
}

/**
 * Reads CV rows written before the stricter storage validator was introduced.
 * New model output and writes must continue to use parseGeneratedCvContent.
 */
export function parseStoredGeneratedCvContent(value: unknown): ParseResult<GeneratedCvContent> {
  const current = parseGeneratedCvContent(value);
  if (current.ok) return current;
  if (isRecord(value) && !("selectedImpact" in value)) {
    const upgraded = parseGeneratedCvContent({ ...value, selectedImpact: [] });
    if (upgraded.ok) return upgraded;
  }
  if (!isRecord(value) || !hasOnlyKeys(value, ["headline", "summary", "skills", "experience", "education"])) return current;

  const headline = legacyStoredNullableText(value.headline);
  const summary = legacyStoredNullableText(value.summary);
  const skills = legacyStoredStringList(value.skills, 100);
  if (headline === undefined || summary === undefined || !skills.ok || !Array.isArray(value.experience) || value.experience.length > 20 || !Array.isArray(value.education) || value.education.length > 20) return current;

  const experience: GeneratedCvContent["experience"] = [];
  for (const item of value.experience) {
    if (!isRecord(item) || !hasOnlyKeys(item, ["company", "role", "startDate", "endDate", "technologies", "achievements"]) || typeof item.company !== "string" || typeof item.role !== "string" || item.company.length > 1200 || item.role.length > 1200) return current;
    const startDate = legacyStoredNullableText(item.startDate);
    const endDate = legacyStoredNullableText(item.endDate);
    const technologies = legacyStoredStringList(item.technologies, 50);
    const achievements = legacyStoredStringList(item.achievements, 30);
    if (startDate === undefined || endDate === undefined || !technologies.ok || !achievements.ok) return current;
    experience.push({ company: item.company.trim(), role: item.role.trim(), startDate, endDate, technologies: technologies.data, achievements: achievements.data });
  }

  const education: GeneratedCvContent["education"] = [];
  for (const item of value.education) {
    if (!isRecord(item) || !hasOnlyKeys(item, ["institution", "degree", "startDate", "endDate"]) || typeof item.institution !== "string" || item.institution.length > 1200) return current;
    const degree = legacyStoredNullableText(item.degree);
    const startDate = legacyStoredNullableText(item.startDate);
    const endDate = legacyStoredNullableText(item.endDate);
    if (degree === undefined || startDate === undefined || endDate === undefined) return current;
    education.push({ institution: item.institution.trim(), degree, startDate, endDate });
  }

  return { ok: true, data: { headline, summary, skills: skills.data, selectedImpact: [], experience, education } };
}
