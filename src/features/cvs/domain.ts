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
  ResumeCritique,
  ResumeCritiqueProblem,
  ResumeStrategy,
  JobRequirementLevel,
  JobResumeRequirements,
  SavedJobRequirement,
  VacancyRequirementSection,
  VacancyAnalysis,
  VacancyRequirement,
} from "./types";

type ParseResult<T> = { ok: true; data: T } | { ok: false; message: string };

export type ResumeCoverageResult = { ok: true } | { ok: false; missing: string[] };

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

function optionalString(value: unknown, field: string, maximum = 600): ParseResult<string> {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maximum) return { ok: false, message: `${field} is invalid.` };
  return { ok: true, data: value.trim() };
}

export function parseResumeStrategy(value: unknown): ParseResult<ResumeStrategy> {
  if (!isRecord(value) || !hasOnlyKeys(value, ["targetPositioning", "topHiringSignals", "evidenceToSurface", "skillsToPrioritize", "skillsToInclude", "experienceThemes", "seniorityNarrative", "terminologyToUse", "itemsToDeEmphasize", "unsupportedRequirements", "summaryDirection", "experienceDirections"])) return { ok: false, message: "Resume strategy contains unsupported fields." };
  const targetPositioning = optionalString(value.targetPositioning, "strategy.targetPositioning");
  const summaryDirection = optionalString(value.summaryDirection, "strategy.summaryDirection");
  if (!targetPositioning.ok) return targetPositioning;
  if (!summaryDirection.ok) return summaryDirection;
  const lists = [
    ["skillsToPrioritize", value.skillsToPrioritize, 100, 100], ["skillsToInclude", value.skillsToInclude, 100, 100], ["experienceThemes", value.experienceThemes, 30, 240],
    ["seniorityNarrative", value.seniorityNarrative, 30, 240], ["terminologyToUse", value.terminologyToUse, 100, 120], ["itemsToDeEmphasize", value.itemsToDeEmphasize, 50, 240], ["unsupportedRequirements", value.unsupportedRequirements, 80, 160],
  ] as const;
  const parsedLists: Record<string, string[]> = {};
  for (const [field, candidate, maximum, itemLength] of lists) {
    const parsed = stringList(candidate, `strategy.${field}`, maximum, itemLength);
    if (!parsed.ok) return parsed;
    parsedLists[field] = parsed.data;
  }
  if (!Array.isArray(value.topHiringSignals) || value.topHiringSignals.length > 30 || !value.topHiringSignals.every((item) => isRecord(item) && hasOnlyKeys(item, ["signal", "priority"]) && typeof item.signal === "string" && item.signal.length > 0 && ["high", "medium", "low"].includes(String(item.priority)))) return { ok: false, message: "strategy.topHiringSignals is invalid." };
  if (!Array.isArray(value.evidenceToSurface) || value.evidenceToSurface.length > 50 || !value.evidenceToSurface.every((item) => isRecord(item) && hasOnlyKeys(item, ["factId", "description", "supports"]) && (item.factId === undefined || typeof item.factId === "string") && typeof item.description === "string" && item.description.length > 0 && Array.isArray(item.supports) && item.supports.every((entry) => typeof entry === "string" && entry.length > 0))) return { ok: false, message: "strategy.evidenceToSurface is invalid." };
  if (!Array.isArray(value.experienceDirections) || value.experienceDirections.length > 20 || !value.experienceDirections.every((item) => isRecord(item) && hasOnlyKeys(item, ["company", "goals"]) && (item.company === undefined || typeof item.company === "string") && Array.isArray(item.goals) && item.goals.length > 0 && item.goals.every((goal) => typeof goal === "string" && goal.length > 0))) return { ok: false, message: "strategy.experienceDirections is invalid." };
  return {
    ok: true,
    data: {
      targetPositioning: targetPositioning.data,
      topHiringSignals: value.topHiringSignals.map((item) => ({ signal: String((item as Record<string, unknown>).signal), priority: (item as Record<string, unknown>).priority as "high" | "medium" | "low" })),
      evidenceToSurface: value.evidenceToSurface.map((item) => ({ factId: typeof (item as Record<string, unknown>).factId === "string" ? (item as Record<string, unknown>).factId as string : undefined, description: String((item as Record<string, unknown>).description), supports: ((item as Record<string, unknown>).supports as string[]).slice() })),
      skillsToPrioritize: parsedLists.skillsToPrioritize, skillsToInclude: parsedLists.skillsToInclude, experienceThemes: parsedLists.experienceThemes,
      seniorityNarrative: parsedLists.seniorityNarrative, terminologyToUse: parsedLists.terminologyToUse, itemsToDeEmphasize: parsedLists.itemsToDeEmphasize,
      unsupportedRequirements: parsedLists.unsupportedRequirements, summaryDirection: summaryDirection.data,
      experienceDirections: value.experienceDirections.map((item) => ({ company: typeof (item as Record<string, unknown>).company === "string" ? (item as Record<string, unknown>).company as string : undefined, goals: ((item as Record<string, unknown>).goals as string[]).slice() })),
    },
  };
}

const CRITIQUE_TYPES: ResumeCritiqueProblem["type"][] = ["missing_requirement", "weak_seniority", "generic_summary", "master_resume_similarity", "missing_skill", "poor_prioritization", "unsupported_claim", "keyword_stuffing", "weak_bullet", "other"];

export function parseResumeCritique(value: unknown): ParseResult<ResumeCritique> {
  if (!isRecord(value) || !hasOnlyKeys(value, ["score", "passes", "problems", "missingSupportedRequirements", "unsupportedClaims", "strengths"]) || typeof value.score !== "number" || value.score < 0 || value.score > 10 || typeof value.passes !== "boolean") return { ok: false, message: "Resume critique contains unsupported fields." };
  const problems: ResumeCritiqueProblem[] = [];
  if (!Array.isArray(value.problems) || value.problems.length > 40) return { ok: false, message: "Resume critique problems are invalid." };
  for (const item of value.problems) {
    if (!isRecord(item) || !hasOnlyKeys(item, ["type", "severity", "description", "suggestedFix"]) || !CRITIQUE_TYPES.includes(item.type as ResumeCritiqueProblem["type"]) || !["high", "medium", "low"].includes(String(item.severity)) || typeof item.description !== "string" || item.description.length === 0 || (item.suggestedFix !== undefined && typeof item.suggestedFix !== "string")) return { ok: false, message: "A resume critique problem is invalid." };
    problems.push({ type: item.type as ResumeCritiqueProblem["type"], severity: item.severity as ResumeCritiqueProblem["severity"], description: item.description, suggestedFix: item.suggestedFix as string | undefined });
  }
  const missing = stringList(value.missingSupportedRequirements, "critique.missingSupportedRequirements", 80, 160);
  const unsupported = stringList(value.unsupportedClaims, "critique.unsupportedClaims", 40, 300);
  const strengths = stringList(value.strengths, "critique.strengths", 40, 300);
  if (!missing.ok) return missing;
  if (!unsupported.ok) return unsupported;
  if (!strengths.ok) return strengths;
  return { ok: true, data: { score: value.score, passes: value.passes, problems, missingSupportedRequirements: missing.data, unsupportedClaims: unsupported.data, strengths: strengths.data } };
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
  const unsupported = ["managed", "managing", "manager", "management", "mentored", "mentoring", "led a team", "team of", "revenue", "customers", "users", "promoted", "award", "organization wide", "cross team"];
  return unsupported.some((phrase) => normalizedText.includes(phrase) && !normalizedSource.includes(phrase));
}

function numbers(value: string): string[] {
  return value.match(/\b\d[\d,.%]*\b/g) ?? [];
}

function requirementMentioned(requirement: VacancyRequirement, searchable: string): boolean {
  const label = normalized(requirement.label);
  if (searchable.includes(label)) return true;
  const terms = label.split(" ").filter((term) => term.length >= 3);
  return terms.length > 1 && terms.every((term) => searchable.includes(term));
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
  const allowedSkills = new Set([
    ...profile.skills,
    ...profile.experience.flatMap((experience) => experience.technologies),
  ].map(normalized));
  const familiarSkills = new Set<string>();
  for (const confirmation of confirmations) {
    if (confirmation.level === "commercial") allowedSkills.add(normalized(confirmation.label));
    if (confirmation.level === "familiar") familiarSkills.add(normalized(`familiar: ${confirmation.label}`));
  }
  const skills = stringList(value.skills, "resume skills", 100, 100);
  const educationIds = stringList(value.educationIds, "resume education", 20, 64);
  if (!skills.ok) return skills;
  if (!educationIds.ok) return educationIds;
  const verifiedSkills = skills.data.filter((skill) => allowedSkills.has(normalized(skill)) || familiarSkills.has(normalized(skill)));
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
      // A model can produce a valid citation while over-strengthening the
      // wording. Keep the pipeline resumable and factual by falling back to
      // the cited Knowledge Base text; the critique stage can still assess the
      // resulting bullet for quality.
      const safeBullet = containsUnsupportedClaim(bullet.text, sourceText) || numbers(bullet.text).some((number) => !sourceText.includes(number)) ? sourceText : bullet.text;
      if (/<[a-z][^>]*>/i.test(bullet.text)) return { ok: false, message: "Resume bullets cannot contain HTML." };
      achievements.push(safeBullet);
    }
    if (achievements.length === 0) return { ok: false, message: "Every selected experience needs at least one verified bullet." };
    experience.push({ company: source.company, role: source.role, startDate: source.startDate, endDate: source.endDate, technologies: [...source.technologies], achievements });
  }
  for (const id of educationIds.data) if (!profile.education.some((education) => education.id === id)) return { ok: false, message: "The model selected education outside the verified profile." };
  const allSourceText = candidateEvidence(profile).join(" ");
  const safeHeadline = headline && (containsUnsupportedClaim(headline, allSourceText) || numbers(headline).some((number) => !allSourceText.includes(number))) ? profile.personal.title : headline;
  const safeSummary = summary && containsUnsupportedClaim(summary, allSourceText) ? profile.summary : summary;
  return {
    ok: true,
    data: {
      headline: safeHeadline ?? profile.personal.title,
      summary: safeSummary,
      skills: verifiedSkills,
      experience,
      education: educationIds.data.map((id) => {
        const education = profile.education.find((candidate) => candidate.id === id);
        return { institution: education?.institution ?? "", degree: education?.degree ?? null, startDate: education?.startDate ?? null, endDate: education?.endDate ?? null };
      }),
    },
  };
}

export function validateResumeRequirementCoverage(
  analysis: VacancyAnalysis,
  confirmations: readonly ResumeConfirmation[],
  content: GeneratedCvContent,
): ResumeCoverageResult {
  const confirmed = new Map(confirmations.map((confirmation) => [confirmation.key, confirmation]));
  const requirements = REQUIREMENT_SECTIONS.flatMap((section) => analysis[section])
    .filter((requirement) => requirement.importance === "must_have" && (requirement.status === "supported" || requirement.status === "confirmed_familiar" || confirmed.get(requirement.key)?.level === "commercial" || confirmed.get(requirement.key)?.level === "familiar"));
  const searchable = normalized([content.headline ?? "", content.summary ?? "", ...content.skills, ...content.experience.flatMap((experience) => [experience.role, ...experience.technologies, ...experience.achievements])].join(" "));
  const missing = requirements.filter((requirement) => !requirementMentioned(requirement, searchable)).map((requirement) => requirement.label);
  return missing.length > 0 ? { ok: false, missing } : { ok: true };
}
