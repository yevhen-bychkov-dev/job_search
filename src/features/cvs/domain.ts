import type { CandidateProfile } from "@/features/knowledge/candidate-profile";

import type { CvSelection, GeneratedCvContent } from "./types";

type ParseResult<T> = { ok: true; data: T } | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = new Set(allowed);
  return Object.keys(record).every((key) => keys.has(key));
}

function stringList(value: unknown, field: string, maximum: number): ParseResult<string[]> {
  if (!Array.isArray(value) || value.length > maximum || !value.every((item) => typeof item === "string" && item.length > 0 && item.length <= 160)) {
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
    const achievements = stringList(candidate.achievements, "achievements", 30);
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
