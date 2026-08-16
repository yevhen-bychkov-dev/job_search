export type CandidateAchievement = {
  id: string;
  text: string;
  skills: string[];
  categories: string[];
};

export type CandidateExperience = {
  id: string;
  company: string;
  role: string;
  startDate: string | null;
  endDate: string | null;
  technologies: string[];
  achievements: CandidateAchievement[];
};

export type CandidateEducation = {
  id: string;
  institution: string;
  degree: string | null;
  startDate: string | null;
  endDate: string | null;
};

export type CandidateProfile = {
  personal: {
    name: string;
    title: string | null;
    location: string | null;
    email: string | null;
    phone: string | null;
    links: Record<string, string>;
  };
  summary: string | null;
  skills: string[];
  experience: CandidateExperience[];
  education: CandidateEducation[];
};

export type CandidateProfileForAi = Omit<CandidateProfile, "personal"> & {
  professionalTitle: string | null;
};

export const CANDIDATE_PROFILE_EXAMPLE = {
  personal: {
    name: "Alex Example",
    title: "Frontend Engineer",
    location: "Warsaw, Poland",
    email: "alex@example.test",
    phone: "+48 000 000 000",
    links: { LinkedIn: "https://www.linkedin.com/in/example" },
  },
  summary: "Frontend engineer focused on accessible, reliable web applications.",
  skills: ["TypeScript", "React", "Next.js"],
  experience: [
    {
      id: "synthetic-labs-frontend",
      company: "Synthetic Labs",
      role: "Frontend Engineer",
      startDate: "2023-01",
      endDate: null,
      technologies: ["TypeScript", "React"],
      achievements: [
        {
          id: "accessible-design-system",
          text: "Built accessible shared components used across internal applications.",
          skills: ["React", "Accessibility"],
          categories: ["frontend"],
        },
      ],
    },
  ],
  education: [
    {
      id: "example-university-cs",
      institution: "Example University",
      degree: "BSc Computer Science",
      startDate: "2018",
      endDate: "2021",
    },
  ],
} as const;

type ParseResult<T> = { ok: true; data: T } | { ok: false; message: string };

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const DATE_PATTERN = /^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(record).every((key) => allowedSet.has(key));
}

function text(
  value: unknown,
  field: string,
  maximum: number,
  options: { optional?: boolean; pattern?: RegExp } = {},
): ParseResult<string | null> {
  if ((value === undefined || value === null || value === "") && options.optional) {
    return { ok: true, data: null };
  }
  if (typeof value !== "string") return { ok: false, message: `${field} must be text.` };
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    return { ok: false, message: `${field} must contain 1-${maximum} characters.` };
  }
  if (options.pattern && !options.pattern.test(normalized)) {
    return { ok: false, message: `${field} has an invalid format.` };
  }
  return { ok: true, data: normalized };
}

function stringArray(
  value: unknown,
  field: string,
  maximumItems: number,
  maximumLength: number,
  minimumItems = 0,
): ParseResult<string[]> {
  if (!Array.isArray(value) || value.length < minimumItems || value.length > maximumItems) {
    return { ok: false, message: `${field} must contain ${minimumItems}-${maximumItems} items.` };
  }
  const result: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const parsed = text(value[index], `${field}[${index}]`, maximumLength);
    if (!parsed.ok || parsed.data === null) return parsed as ParseResult<string[]>;
    const key = parsed.data.toLocaleLowerCase("en");
    if (seen.has(key)) return { ok: false, message: `${field} must not contain duplicates.` };
    seen.add(key);
    result.push(parsed.data);
  }
  return { ok: true, data: result };
}

function id(value: unknown, field: string): ParseResult<string> {
  const parsed = text(value, field, 64, { pattern: ID_PATTERN });
  if (!parsed.ok || parsed.data === null) return parsed as ParseResult<string>;
  return { ok: true, data: parsed.data };
}

function date(value: unknown, field: string): ParseResult<string | null> {
  return text(value, field, 10, { optional: true, pattern: DATE_PATTERN });
}

function parseLinks(value: unknown): ParseResult<Record<string, string>> {
  if (value === undefined) return { ok: true, data: {} };
  if (!isRecord(value) || Object.keys(value).length > 12) {
    return { ok: false, message: "personal.links must be an object with at most 12 entries." };
  }
  const links: Record<string, string> = {};
  for (const [label, candidate] of Object.entries(value)) {
    const parsedLabel = text(label, "personal.links label", 40);
    const parsedUrl = text(candidate, `personal.links.${label}`, 500);
    if (!parsedLabel.ok || parsedLabel.data === null) return parsedLabel as ParseResult<Record<string, string>>;
    if (!parsedUrl.ok || parsedUrl.data === null) return parsedUrl as ParseResult<Record<string, string>>;
    try {
      const url = new URL(parsedUrl.data);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
    } catch {
      return { ok: false, message: `personal.links.${label} must be an HTTP(S) URL.` };
    }
    links[parsedLabel.data] = parsedUrl.data;
  }
  return { ok: true, data: links };
}

function parseAchievement(value: unknown, index: number): ParseResult<CandidateAchievement> {
  const field = `experience.achievements[${index}]`;
  if (!isRecord(value) || !hasOnlyKeys(value, ["id", "text", "skills", "categories"])) {
    return { ok: false, message: `${field} contains unsupported fields.` };
  }
  const parsedId = id(value.id, `${field}.id`);
  const parsedText = text(value.text, `${field}.text`, 600);
  const skills = stringArray(value.skills ?? [], `${field}.skills`, 30, 80);
  const categories = stringArray(value.categories ?? [], `${field}.categories`, 20, 80);
  if (!parsedId.ok) return parsedId;
  if (!parsedText.ok || parsedText.data === null) return parsedText as ParseResult<CandidateAchievement>;
  if (!skills.ok) return skills;
  if (!categories.ok) return categories;
  return {
    ok: true,
    data: { id: parsedId.data, text: parsedText.data, skills: skills.data, categories: categories.data },
  };
}

function parseExperience(value: unknown, index: number): ParseResult<CandidateExperience> {
  const field = `experience[${index}]`;
  if (!isRecord(value) || !hasOnlyKeys(value, ["id", "company", "role", "startDate", "endDate", "technologies", "achievements"])) {
    return { ok: false, message: `${field} contains unsupported fields.` };
  }
  const parsedId = id(value.id, `${field}.id`);
  const company = text(value.company, `${field}.company`, 160);
  const role = text(value.role, `${field}.role`, 160);
  const startDate = date(value.startDate, `${field}.startDate`);
  const endDate = date(value.endDate, `${field}.endDate`);
  const technologies = stringArray(value.technologies ?? [], `${field}.technologies`, 50, 80);
  if (!Array.isArray(value.achievements) || value.achievements.length < 1 || value.achievements.length > 30) {
    return { ok: false, message: `${field}.achievements must contain 1-30 items.` };
  }
  if (!parsedId.ok) return parsedId;
  if (!company.ok || company.data === null) return company as ParseResult<CandidateExperience>;
  if (!role.ok || role.data === null) return role as ParseResult<CandidateExperience>;
  if (!startDate.ok) return startDate;
  if (!endDate.ok) return endDate;
  if (!technologies.ok) return technologies;
  const achievements: CandidateAchievement[] = [];
  const achievementIds = new Set<string>();
  for (let achievementIndex = 0; achievementIndex < value.achievements.length; achievementIndex += 1) {
    const achievement = parseAchievement(value.achievements[achievementIndex], achievementIndex);
    if (!achievement.ok) return achievement;
    if (achievementIds.has(achievement.data.id)) {
      return { ok: false, message: `${field}.achievements must use unique ids.` };
    }
    achievementIds.add(achievement.data.id);
    achievements.push(achievement.data);
  }
  return {
    ok: true,
    data: {
      id: parsedId.data,
      company: company.data,
      role: role.data,
      startDate: startDate.data,
      endDate: endDate.data,
      technologies: technologies.data,
      achievements,
    },
  };
}

function parseEducation(value: unknown, index: number): ParseResult<CandidateEducation> {
  const field = `education[${index}]`;
  if (!isRecord(value) || !hasOnlyKeys(value, ["id", "institution", "degree", "startDate", "endDate"])) {
    return { ok: false, message: `${field} contains unsupported fields.` };
  }
  const parsedId = id(value.id, `${field}.id`);
  const institution = text(value.institution, `${field}.institution`, 160);
  const degree = text(value.degree, `${field}.degree`, 200, { optional: true });
  const startDate = date(value.startDate, `${field}.startDate`);
  const endDate = date(value.endDate, `${field}.endDate`);
  if (!parsedId.ok) return parsedId;
  if (!institution.ok || institution.data === null) return institution as ParseResult<CandidateEducation>;
  if (!degree.ok) return degree;
  if (!startDate.ok) return startDate;
  if (!endDate.ok) return endDate;
  return { ok: true, data: { id: parsedId.data, institution: institution.data, degree: degree.data, startDate: startDate.data, endDate: endDate.data } };
}

export function parseCandidateProfile(value: unknown): ParseResult<CandidateProfile> {
  if (!isRecord(value) || !hasOnlyKeys(value, ["personal", "summary", "skills", "experience", "education"])) {
    return { ok: false, message: "Candidate profile must be an object with only supported fields." };
  }
  if (!isRecord(value.personal) || !hasOnlyKeys(value.personal, ["name", "title", "location", "email", "phone", "links"])) {
    return { ok: false, message: "personal contains unsupported fields." };
  }
  const name = text(value.personal.name, "personal.name", 120);
  const title = text(value.personal.title, "personal.title", 160, { optional: true });
  const location = text(value.personal.location, "personal.location", 160, { optional: true });
  const email = text(value.personal.email, "personal.email", 254, { optional: true });
  const phone = text(value.personal.phone, "personal.phone", 60, { optional: true });
  const links = parseLinks(value.personal.links);
  const summary = text(value.summary, "summary", 1200, { optional: true });
  const skills = stringArray(value.skills, "skills", 100, 80, 1);
  if (!Array.isArray(value.experience) || value.experience.length < 1 || value.experience.length > 20) {
    return { ok: false, message: "experience must contain 1-20 items." };
  }
  if (value.education !== undefined && (!Array.isArray(value.education) || value.education.length > 20)) {
    return { ok: false, message: "education must be an array with at most 20 items." };
  }
  if (!name.ok || name.data === null) return name as ParseResult<CandidateProfile>;
  if (!title.ok) return title;
  if (!location.ok) return location;
  if (!email.ok) return email;
  if (!phone.ok) return phone;
  if (!links.ok) return links;
  if (!summary.ok) return summary;
  if (!skills.ok) return skills;
  const experience: CandidateExperience[] = [];
  const experienceIds = new Set<string>();
  for (let index = 0; index < value.experience.length; index += 1) {
    const parsed = parseExperience(value.experience[index], index);
    if (!parsed.ok) return parsed;
    if (experienceIds.has(parsed.data.id)) return { ok: false, message: "experience must use unique ids." };
    experienceIds.add(parsed.data.id);
    experience.push(parsed.data);
  }
  const education: CandidateEducation[] = [];
  const educationIds = new Set<string>();
  for (let index = 0; index < (value.education ?? []).length; index += 1) {
    const parsed = parseEducation((value.education as unknown[])[index], index);
    if (!parsed.ok) return parsed;
    if (educationIds.has(parsed.data.id)) return { ok: false, message: "education must use unique ids." };
    educationIds.add(parsed.data.id);
    education.push(parsed.data);
  }
  return {
    ok: true,
    data: {
      personal: { name: name.data, title: title.data, location: location.data, email: email.data, phone: phone.data, links: links.data },
      summary: summary.data,
      skills: skills.data,
      experience,
      education,
    },
  };
}

export function parseCandidateProfileBytes(bytes: Uint8Array): ParseResult<CandidateProfile> {
  if (bytes.byteLength > 200_000) return { ok: false, message: "Candidate profile JSON must be 200 KB or smaller." };
  try {
    const json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return parseCandidateProfile(JSON.parse(json) as unknown);
  } catch {
    return { ok: false, message: "Candidate profile must contain valid UTF-8 JSON." };
  }
}

export function candidateProfileForAi(profile: CandidateProfile): CandidateProfileForAi {
  return {
    professionalTitle: profile.personal.title,
    summary: profile.summary,
    skills: [...profile.skills],
    experience: structuredClone(profile.experience),
    education: structuredClone(profile.education),
  };
}
