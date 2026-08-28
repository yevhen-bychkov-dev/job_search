import type { EmploymentType, WorkMode } from "@/features/jobs/types";

import type { JobSearchFilters, NormalizedExternalJob } from "../types";
import { htmlToText, isoDate, rssItems, rssTag } from "../rss.ts";

const TECHNOLOGIES = [
  "TypeScript", "JavaScript", "React", "Next.js", "Node.js", "Angular", "Vue.js", "HTML", "CSS",
  "Python", "Java", ".NET", "C#", "C++", "Golang", "Go", "Ruby", "PHP", "Rust", "Scala",
  "AWS", "Azure", "GCP", "Docker", "Kubernetes", "PostgreSQL", "MySQL", "MongoDB", "GraphQL",
];

function canonicalDouUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.hostname !== "jobs.dou.ua") return null;
    if (!/^\/companies\/[^/]+\/vacancies\/\d+\/?$/.test(url.pathname)) return null;
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function titleParts(value: string): { title: string; company: string; location: string } {
  const separator = value.lastIndexOf(" в ") >= 0 ? " в " : value.lastIndexOf(" at ") >= 0 ? " at " : "";
  if (!separator) return { title: value.trim(), company: "Company not specified", location: "" };
  const index = value.lastIndexOf(separator);
  const title = value.slice(0, index).trim();
  const remainder = value.slice(index + separator.length).trim();
  const [company = "", ...locations] = remainder.split(",").map((part) => part.trim()).filter(Boolean);
  return { title, company: company || "Company not specified", location: locations.join(", ") };
}

function workMode(text: string): WorkMode {
  const value = text.toLocaleLowerCase("uk");
  if (/віддал|remote|remotely/.test(value)) return "remote";
  if (/гібрид|hybrid/.test(value)) return "hybrid";
  return "onsite";
}

function employmentType(text: string): EmploymentType {
  const value = text.toLocaleLowerCase("en");
  if (/part[ -]?time|неповн/.test(value)) return "part_time";
  if (/contract|контракт|b2b/.test(value)) return "contract";
  if (/intern|стажув/.test(value)) return "internship";
  if (/full[ -]?time|повн/.test(value)) return "full_time";
  return "unspecified";
}

function technologies(text: string, category?: string): string[] {
  const haystack = text.toLocaleLowerCase("en");
  const matched = TECHNOLOGIES.filter((technology) => haystack.includes(technology.toLocaleLowerCase("en")));
  return [...new Set([...(category ? [category] : []), ...matched])].slice(0, 50);
}

export function normalizeDouFeed(xml: string, filters: JobSearchFilters): NormalizedExternalJob[] {
  return rssItems(xml).flatMap((item) => {
    const url = canonicalDouUrl(rssTag(item, "link"));
    const externalId = url?.pathname.match(/\/vacancies\/(\d+)\/?$/)?.[1];
    const parts = titleParts(rssTag(item, "title"));
    if (!url || !externalId || parts.title.length < 2 || parts.company.length < 2) return [];
    const description = htmlToText(rssTag(item, "description"));
    const combined = `${parts.title}\n${parts.location}\n${description}`;
    const normalized: NormalizedExternalJob = {
      source: "dou",
      sourceName: "DOU",
      externalId,
      title: parts.title.slice(0, 200),
      company: parts.company.slice(0, 200),
      location: parts.location.slice(0, 200),
      workMode: workMode(combined),
      employmentType: employmentType(combined),
      technologies: technologies(combined, filters.categories[0]),
      description,
      postedAt: isoDate(rssTag(item, "pubDate")),
      url: url.toString(),
    };
    return filters.workModes.length === 0 || filters.workModes.includes(normalized.workMode) ? [normalized] : [];
  });
}

export function parseDouDescriptionHtml(html: string): string {
  const section = html.match(/<div[^>]*class=["'][^"']*vacancy-section[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i)?.[1] ?? "";
  return htmlToText(section);
}
