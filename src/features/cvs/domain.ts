import type { CandidateProfile } from "@/features/knowledge/candidate-profile";

import {
  JOB_REQUIREMENT_LEVELS,
  VACANCY_REQUIREMENT_SECTIONS,
} from "./types.ts";
import type {
  CvSelection,
  GeneratedCvContent,
  ResumeConfirmation,
  ResumeConfirmationQuestion,
  JobRequirementLevel,
  JobResumeRequirements,
  SavedJobRequirement,
  VacancyRequirementSection,
  VacancyAnalysis,
  VacancyRequirement,
} from "./types";

type ParseResult<T> = { ok: true; data: T } | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = new Set(allowed);
  return Object.keys(record).every((key) => keys.has(key));
}

function stringList(
  value: unknown,
  field: string,
  maximumItems: number,
  maximumItemLength = 160,
): ParseResult<string[]> {
  if (!Array.isArray(value) || value.length > maximumItems || !value.every((item) =>
    typeof item === "string" && item.length > 0 && item.length <= maximumItemLength
  )) {
    return { ok: false, message: `${field} is invalid.` };
  }
  if (new Set(value).size !== value.length) return { ok: false, message: `${field} contains duplicate values.` };
  return { ok: true, data: value };
}

export function parseCvSelection(value: unknown): ParseResult<CvSelection> {
  if (!isRecord(value) || !hasOnlyKeys(value, ["includeSummary", "skillOrder", "experience", "educationIds"])) {
    return { ok: false, message: "The model response contains unsupported fields." };
  }
  if (typeof value.includeSummary !== "boolean") return { ok: false, message: "includeSummary is invalid." };
  const skillOrder = stringList(value.skillOrder, "skillOrder", 100);
  const educationIds = stringList(value.educationIds, "educationIds", 20);
  if (!skillOrder.ok) return skillOrder;
  if (!educationIds.ok) return educationIds;
  if (!Array.isArray(value.experience) || value.experience.length < 1 || value.experience.length > 20) {
    return { ok: false, message: "experience is invalid." };
  }
  const experience: CvSelection["experience"] = [];
  const experienceIds = new Set<string>();
  for (const candidate of value.experience) {
    if (!isRecord(candidate) || !hasOnlyKeys(candidate, ["experienceId", "achievementIds"]) || typeof candidate.experienceId !== "string" || candidate.experienceId.length > 64) {
      return { ok: false, message: "An experience selection is invalid." };
    }
    const achievementIds = stringList(candidate.achievementIds, "achievementIds", 30);
    if (!achievementIds.ok) return achievementIds;
    if (experienceIds.has(candidate.experienceId)) return { ok: false, message: "An experience was selected more than once." };
    experienceIds.add(candidate.experienceId);
    experience.push({ experienceId: candidate.experienceId, achievementIds: achievementIds.data });
  }
  return { ok: true, data: { includeSummary: value.includeSummary, skillOrder: skillOrder.data, experience, educationIds: educationIds.data } };
}

export function materializeGeneratedCv(
  profile: CandidateProfile,
  untrustedSelection: unknown,
): ParseResult<GeneratedCvContent> {
  const parsed = parseCvSelection(untrustedSelection);
  if (!parsed.ok) return parsed;
  const skillSet = new Set(profile.skills);
  if (!parsed.data.skillOrder.every((skill) => skillSet.has(skill))) {
    return { ok: false, message: "The model selected a skill outside the verified profile." };
  }
  if (parsed.data.includeSummary && !profile.summary) {
    return { ok: false, message: "The model selected a summary that does not exist." };
  }
  const experienceById = new Map(profile.experience.map((experience) => [experience.id, experience]));
  const experience: GeneratedCvContent["experience"] = [];
  for (const selection of parsed.data.experience) {
    const source = experienceById.get(selection.experienceId);
    if (!source) return { ok: false, message: "The model selected experience outside the verified profile." };
    const achievementById = new Map(source.achievements.map((achievement) => [achievement.id, achievement]));
    const achievements: string[] = [];
    for (const achievementId of selection.achievementIds) {
      const achievement = achievementById.get(achievementId);
      if (!achievement) return { ok: false, message: "The model selected an achievement outside its verified experience." };
      achievements.push(achievement.text);
    }
    experience.push({
      company: source.company,
      role: source.role,
      startDate: source.startDate,
      endDate: source.endDate,
      technologies: [...source.technologies],
      achievements,
    });
  }
  const educationById = new Map(profile.education.map((education) => [education.id, education]));
  const education: GeneratedCvContent["education"] = [];
  for (const educationId of parsed.data.educationIds) {
    const source = educationById.get(educationId);
    if (!source) return { ok: false, message: "The model selected education outside the verified profile." };
    education.push({ institution: source.institution, degree: source.degree, startDate: source.startDate, endDate: source.endDate });
  }
  return {
    ok: true,
    data: {
      headline: profile.personal.title,
      summary: parsed.data.includeSummary ? profile.summary : null,
      skills: parsed.data.skillOrder,
      experience,
      education,
    },
  };
}

export function nextCvVersion(versions: readonly number[]): number {
  return versions.reduce((highest, version) => Number.isInteger(version) && version > highest ? version : highest, 0) + 1;
}

export function parseGeneratedCvContent(value: unknown): ParseResult<GeneratedCvContent> {
  if (!isRecord(value) || !hasOnlyKeys(value, ["headline", "summary", "skills", "experience", "education"])) {
    return { ok: false, message: "Stored CV content is invalid." };
  }
  const nullableText = (candidate: unknown) => candidate === null || (typeof candidate === "string" && candidate.length <= 1200);
  const skills = stringList(value.skills, "skills", 100);
  if (!nullableText(value.headline) || !nullableText(value.summary) || !skills.ok || !Array.isArray(value.experience) || !Array.isArray(value.education)) {
    return { ok: false, message: "Stored CV content is invalid." };
  }
  const experience: GeneratedCvContent["experience"] = [];
  for (const candidate of value.experience) {
    if (!isRecord(candidate) || !hasOnlyKeys(candidate, ["company", "role", "startDate", "endDate", "technologies", "achievements"])) return { ok: false, message: "Stored CV experience is invalid." };
    const technologies = stringList(candidate.technologies, "technologies", 50);
    const achievements = stringList(candidate.achievements, "achievements", 30, 600);
    if (typeof candidate.company !== "string" || typeof candidate.role !== "string" || !nullableText(candidate.startDate) || !nullableText(candidate.endDate) || !technologies.ok || !achievements.ok) return { ok: false, message: "Stored CV experience is invalid." };
    experience.push({ company: candidate.company, role: candidate.role, startDate: candidate.startDate as string | null, endDate: candidate.endDate as string | null, technologies: technologies.data, achievements: achievements.data });
  }
  const education: GeneratedCvContent["education"] = [];
  for (const candidate of value.education) {
    if (!isRecord(candidate) || !hasOnlyKeys(candidate, ["institution", "degree", "startDate", "endDate"]) || typeof candidate.institution !== "string" || !nullableText(candidate.degree) || !nullableText(candidate.startDate) || !nullableText(candidate.endDate)) return { ok: false, message: "Stored CV education is invalid." };
    education.push({ institution: candidate.institution, degree: candidate.degree as string | null, startDate: candidate.startDate as string | null, endDate: candidate.endDate as string | null });
  }
  return { ok: true, data: { headline: value.headline as string | null, summary: value.summary as string | null, skills: skills.data, experience, education } };
}

const REQUIREMENT_CATEGORIES: VacancyRequirement["category"][] = [
  "technical", "tooling", "architecture", "domain", "responsibility", "collaboration", "leadership",
];

export const REQUIREMENT_SECTIONS = VACANCY_REQUIREMENT_SECTIONS;
const MAX_REQUIREMENT_EVIDENCE_LENGTH = 1200;

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

export function savedJobRequirementsToAnalysis(saved: JobResumeRequirements): VacancyAnalysis {
  const analysis = structuredClone(saved.analysis);
  for (const section of REQUIREMENT_SECTIONS) {
    analysis[section] = saved.requirements
      .filter((requirement) => requirement.section === section)
      .map((requirement) => ({ ...requirement, status: statusForRequirementLevel(requirement.level) }));
  }
  return analysis;
}

export function validateSavedJobRequirements(value: unknown): { ok: true; data: SavedJobRequirement[] } | { ok: false; message: string } {
  if (!Array.isArray(value) || value.length > 80) return { ok: false, message: "The job requirements list is invalid." };
  const keys = new Set<string>();
  const result: SavedJobRequirement[] = [];
  for (const item of value) {
    if (!isRecord(item)) return { ok: false, message: "The job requirements list is invalid." };
    const key = typeof item.key === "string" ? item.key.trim() : "";
    const label = typeof item.label === "string" ? item.label.trim() : "";
    const section = item.section;
    const category = item.category;
    const importance = item.importance;
    const level = item.level;
    if (!/^[a-z0-9-]{1,120}$/.test(key) || !label || label.length > 160 || !REQUIREMENT_SECTIONS.includes(section as VacancyRequirementSection) || !REQUIREMENT_CATEGORIES.includes(category as VacancyRequirement["category"]) || (importance !== "must_have" && importance !== "nice_to_have") || !JOB_REQUIREMENT_LEVELS.includes(level as JobRequirementLevel)) {
      return { ok: false, message: "Each job requirement must have a valid label, category, and level." };
    }
    if (keys.has(key)) return { ok: false, message: "The job requirements list contains duplicates." };
    keys.add(key);
    const evidenceValues = item.evidence;
    if (!Array.isArray(evidenceValues) || evidenceValues.length > 10 || !evidenceValues.every((entry) => typeof entry === "string" && entry.length > 0 && entry.length <= MAX_REQUIREMENT_EVIDENCE_LENGTH)) return { ok: false, message: "requirement evidence is invalid." };
    const evidence = evidenceValues as string[];
    result.push({ key, label, section: section as VacancyRequirementSection, category: category as VacancyRequirement["category"], importance, level: level as JobRequirementLevel, source: item.source === "user" ? "user" : "ai", status: statusForRequirementLevel(level as JobRequirementLevel), evidence });
  }
  return { ok: true, data: result };
}

function normalized(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function stableRequirementKey(label: string): string {
  return label
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function parseRequirement(value: unknown): ParseResult<VacancyRequirement> {
  if (!isRecord(value) || !hasOnlyKeys(value, ["key", "label", "category", "importance", "status", "evidence"])) {
    return { ok: false, message: "Vacancy requirement is invalid." };
  }
  if (typeof value.key !== "string") return { ok: false, message: "Vacancy requirement key is invalid." };
  if (typeof value.label !== "string" || value.label.length < 1 || value.label.length > 160) return { ok: false, message: "Vacancy requirement label is invalid." };
  const key = stableRequirementKey(value.label);
  if (!/^[a-z0-9-]{1,120}$/.test(key)) return { ok: false, message: "Vacancy requirement label cannot produce a valid key." };
  if (typeof value.category !== "string" || !REQUIREMENT_CATEGORIES.includes(value.category as VacancyRequirement["category"])) return { ok: false, message: "Vacancy requirement category is invalid." };
  if (value.importance !== "must_have" && value.importance !== "nice_to_have") return { ok: false, message: "Vacancy requirement importance is invalid." };
  if (value.status !== "supported" && value.status !== "unconfirmed") return { ok: false, message: "Vacancy requirement status is invalid." };
  const evidenceValues = value.evidence;
  if (!Array.isArray(evidenceValues) || evidenceValues.length > 10 || !evidenceValues.every((entry) => typeof entry === "string" && entry.length > 0 && entry.length <= MAX_REQUIREMENT_EVIDENCE_LENGTH)) return { ok: false, message: "requirement evidence is invalid." };
  return { ok: true, data: { key, label: value.label, category: value.category as VacancyRequirement["category"], importance: value.importance, status: value.status, evidence: evidenceValues as string[] } };
}

function parseRequirementList(value: unknown, field: string): ParseResult<VacancyRequirement[]> {
  if (!Array.isArray(value) || value.length > 80) return { ok: false, message: `${field} is invalid.` };
  const output: VacancyRequirement[] = [];
  const keys = new Set<string>();
  for (const item of value) {
    const parsed = parseRequirement(item);
    if (!parsed.ok) return parsed;
    if (keys.has(parsed.data.key)) return { ok: false, message: `${field} contains duplicate requirements.` };
    keys.add(parsed.data.key);
    output.push(parsed.data);
  }
  return { ok: true, data: output };
}

export function parseVacancyAnalysis(value: unknown): ParseResult<VacancyAnalysis> {
  const fields = ["mustHaveTechnical", "niceToHaveTechnical", "tooling", "architecture", "domainKnowledge", "responsibilities", "ownershipExpectations", "senioritySignals", "collaborationExpectations", "leadershipExpectations", "atsKeywords", "employerTerminology"] as const;
  if (!isRecord(value) || !hasOnlyKeys(value, fields)) return { ok: false, message: "Vacancy analysis contains unsupported fields." };
  const parsedLists = awaitlessRequirementLists(value, ["mustHaveTechnical", "niceToHaveTechnical", "tooling", "architecture", "domainKnowledge", "responsibilities", "ownershipExpectations", "collaborationExpectations", "leadershipExpectations"] as const);
  if (!parsedLists.ok) return parsedLists;
  const senioritySignals = stringList(value.senioritySignals, "senioritySignals", 30, 240);
  const atsKeywords = stringList(value.atsKeywords, "atsKeywords", 100, 120);
  const employerTerminology = stringList(value.employerTerminology, "employerTerminology", 100, 160);
  if (!senioritySignals.ok) return senioritySignals;
  if (!atsKeywords.ok) return atsKeywords;
  if (!employerTerminology.ok) return employerTerminology;
  return { ok: true, data: { ...parsedLists.data, senioritySignals: senioritySignals.data, atsKeywords: atsKeywords.data, employerTerminology: employerTerminology.data } };
}

function awaitlessRequirementLists<T extends readonly string[]>(
  value: Record<string, unknown>,
  fields: T,
): ParseResult<{ [K in T[number]]: VacancyRequirement[] }> {
  const output = {} as { [K in T[number]]: VacancyRequirement[] };
  for (const field of fields) {
    const parsed = parseRequirementList(value[field], field);
    if (!parsed.ok) return parsed;
    output[field as T[number]] = parsed.data;
  }
  return { ok: true, data: output };
}

function candidateEvidence(profile: CandidateProfile): string[] {
  return [
    profile.personal.title ?? "",
    profile.summary ?? "",
    ...profile.skills,
    ...profile.experience.flatMap((experience) => [experience.role, ...experience.technologies, ...experience.achievements.map((achievement) => achievement.text)]),
    ...profile.education.flatMap((education) => [education.degree ?? "", education.institution]),
  ].filter(Boolean);
}

export function matchVacancyAnalysis(
  analysis: VacancyAnalysis,
  profile: CandidateProfile,
  confirmations: readonly ResumeConfirmation[] = [],
): VacancyAnalysis {
  const evidence = candidateEvidence(profile);
  const normalizedEvidence = evidence.map(normalized);
  const confirmationByKey = new Map(confirmations.map((confirmation) => [confirmation.key, confirmation]));
  const allLists: Array<keyof VacancyAnalysis> = ["mustHaveTechnical", "niceToHaveTechnical", "tooling", "architecture", "domainKnowledge", "responsibilities", "ownershipExpectations", "collaborationExpectations", "leadershipExpectations"];
  const matched = structuredClone(analysis);
  for (const list of allLists) {
    const result = (analysis[list] as VacancyRequirement[]).map((requirement) => {
      const explicit = confirmationByKey.get(requirement.key);
      const keyMatch = normalizedEvidence.some((entry) => entry === normalized(requirement.label) || entry.includes(normalized(requirement.label)) || normalized(requirement.label).includes(entry));
      const status = explicit?.level === "commercial" || keyMatch
        ? "supported"
        : explicit?.level === "familiar"
          ? "confirmed_familiar"
          : explicit?.level === "none"
            ? "confirmed_none"
            : "unconfirmed";
      return { ...requirement, status, evidence: keyMatch ? evidence.filter((entry) => normalized(entry).includes(normalized(requirement.label))).slice(0, 3) : requirement.evidence };
    });
    (matched as unknown as Record<string, unknown>)[list] = result;
  }
  return matched;
}

export function mergeResumeConfirmations(
  ...groups: Array<readonly ResumeConfirmation[]>
): ResumeConfirmation[] {
  const confirmationsByKey = new Map<string, ResumeConfirmation>();
  for (const group of groups) {
    for (const confirmation of group) confirmationsByKey.set(confirmation.key, confirmation);
  }
  return [...confirmationsByKey.values()];
}

export function confirmationQuestions(analysis: VacancyAnalysis): ResumeConfirmationQuestion[] {
  const lists: VacancyRequirement[] = [
    ...analysis.mustHaveTechnical,
    ...analysis.tooling,
    ...analysis.architecture,
    ...analysis.domainKnowledge,
    ...analysis.responsibilities,
    ...analysis.ownershipExpectations,
    ...analysis.collaborationExpectations,
    ...analysis.leadershipExpectations,
  ];
  return lists.filter((requirement) => requirement.status === "unconfirmed" && requirement.importance === "must_have").slice(0, 12).map((requirement) => ({ key: requirement.key, label: requirement.label, category: requirement.category, importance: requirement.importance }));
}

function containsUnsupportedClaim(text: string, source: string): boolean {
  const normalizedText = normalized(text);
  const normalizedSource = normalized(source);
  const unsupported = ["managed", "managing", "mentored", "mentoring", "led a team", "team of", "revenue", "customers", "users", "promoted", "award", "organization wide", "cross team"];
  return unsupported.some((phrase) => normalizedText.includes(phrase) && !normalizedSource.includes(phrase));
}

function numbers(value: string): string[] {
  return value.match(/\b\d[\d,.%]*\b/g) ?? [];
}

export function materializeResumeContent(
  profile: CandidateProfile,
  value: unknown,
  confirmations: readonly ResumeConfirmation[] = [],
): ParseResult<GeneratedCvContent> {
  if (!isRecord(value) || !hasOnlyKeys(value, ["headline", "summary", "skills", "experience", "educationIds"])) return { ok: false, message: "The model resume contains unsupported fields." };
  const headline = value.headline === null ? null : typeof value.headline === "string" && value.headline.length <= 160 ? value.headline : null;
  const summary = value.summary === null ? null : typeof value.summary === "string" && value.summary.length <= 1200 ? value.summary : null;
  if (value.headline !== null && headline === null || value.summary !== null && summary === null) return { ok: false, message: "The model resume headline or summary is invalid." };
  const allowedSkills = new Set(profile.skills.map(normalized));
  for (const confirmation of confirmations) if (confirmation.level === "commercial") allowedSkills.add(normalized(confirmation.label));
  const skills = stringList(value.skills, "resume skills", 100, 100);
  const educationIds = stringList(value.educationIds, "resume education", 20, 64);
  if (!skills.ok) return skills;
  if (!educationIds.ok) return educationIds;
  const verifiedSkills = skills.data.filter((skill) => allowedSkills.has(normalized(skill)));
  if (!Array.isArray(value.experience) || value.experience.length < 1 || value.experience.length > profile.experience.length) return { ok: false, message: "The model experience selection is invalid." };
  const experienceById = new Map(profile.experience.map((experience) => [experience.id, experience]));
  const selected = new Set<string>();
  const experience: GeneratedCvContent["experience"] = [];
  for (const item of value.experience) {
    if (!isRecord(item) || !hasOnlyKeys(item, ["experienceId", "bullets"]) || typeof item.experienceId !== "string" || !Array.isArray(item.bullets) || selected.has(item.experienceId)) return { ok: false, message: "The model experience selection is invalid." };
    const source = experienceById.get(item.experienceId);
    if (!source) return { ok: false, message: "The model selected experience outside the verified profile." };
    selected.add(item.experienceId);
    const sourceById = new Map(source.achievements.map((achievement) => [achievement.id, achievement.text]));
    const achievements: string[] = [];
    for (const bullet of item.bullets) {
      if (!isRecord(bullet) || !hasOnlyKeys(bullet, ["text", "sourceAchievementIds"]) || typeof bullet.text !== "string" || bullet.text.length < 10 || bullet.text.length > 600) return { ok: false, message: "The model resume bullet is invalid." };
      const sourceIds = stringList(bullet.sourceAchievementIds, "resume bullet sources", 10, 64);
      if (!sourceIds.ok || sourceIds.data.length === 0 || !sourceIds.data.every((id) => sourceById.has(id))) return { ok: false, message: "Every resume bullet must cite verified achievements." };
      const sourceText = sourceIds.data.map((id) => sourceById.get(id) ?? "").join(" ");
      if (containsUnsupportedClaim(bullet.text, sourceText)) return { ok: false, message: "The model introduced an unsupported leadership or impact claim." };
      if (numbers(bullet.text).some((number) => !sourceText.includes(number))) return { ok: false, message: "The model introduced an unsupported metric." };
      if (/<[a-z][^>]*>/i.test(bullet.text)) return { ok: false, message: "Resume bullets cannot contain HTML." };
      achievements.push(bullet.text);
    }
    if (achievements.length === 0) return { ok: false, message: "Every selected experience needs at least one verified bullet." };
    experience.push({ company: source.company, role: source.role, startDate: source.startDate, endDate: source.endDate, technologies: [...source.technologies], achievements });
  }
  for (const id of educationIds.data) if (!profile.education.some((education) => education.id === id)) return { ok: false, message: "The model selected education outside the verified profile." };
  const allSourceText = candidateEvidence(profile).join(" ");
  if (summary && containsUnsupportedClaim(summary, allSourceText)) return { ok: false, message: "The model summary contains an unsupported claim." };
  return {
    ok: true,
    data: {
      headline,
      summary,
      skills: verifiedSkills,
      experience,
      education: educationIds.data.map((id) => {
        const education = profile.education.find((candidate) => candidate.id === id);
        return { institution: education?.institution ?? "", degree: education?.degree ?? null, startDate: education?.startDate ?? null, endDate: education?.endDate ?? null };
      }),
    },
  };
}
