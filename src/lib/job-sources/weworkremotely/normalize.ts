import type { EmploymentType } from "@/features/jobs/types";

import type { JobSearchFilters, NormalizedExternalJob } from "../types";
import { htmlToText, isoDate, rssItems, rssTag } from "../rss.ts";

function canonicalJobUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.hostname !== "weworkremotely.com" || !url.pathname.startsWith("/remote-jobs/")) return null;
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function titleParts(value: string): { company: string; title: string } {
  const index = value.indexOf(":");
  if (index < 1) return { company: "Company not specified", title: value.trim() };
  return { company: value.slice(0, index).trim(), title: value.slice(index + 1).trim() };
}

function employmentType(value: string): EmploymentType {
  const type = value.toLocaleLowerCase("en");
  if (type.includes("full")) return "full_time";
  if (type.includes("part")) return "part_time";
  if (type.includes("contract")) return "contract";
  if (type.includes("intern")) return "internship";
  return "unspecified";
}

function commaValues(value: string): string[] {
  return value.split(/,|\band\b/gi).map((part) => part.trim()).filter((part) => part.length > 1);
}

function includesTerms(haystack: string, query: string): boolean {
  const terms = query.toLocaleLowerCase("en").split(/\s+/).filter(Boolean);
  const value = haystack.toLocaleLowerCase("en");
  return terms.every((term) => value.includes(term));
}

export function normalizeWeWorkRemotelyFeed(xml: string, filters: JobSearchFilters): NormalizedExternalJob[] {
  return rssItems(xml).flatMap((item) => {
    const url = canonicalJobUrl(rssTag(item, "link"));
    const externalId = url?.pathname.slice("/remote-jobs/".length).replace(/\/$/, "");
    const parts = titleParts(rssTag(item, "title"));
    if (!url || !externalId || externalId.length > 200 || parts.title.length < 2 || parts.company.length < 2) return [];
    const region = rssTag(item, "region");
    const country = rssTag(item, "country").replace(/^\p{Extended_Pictographic}+\s*/u, "");
    const state = rssTag(item, "state");
    const location = [...new Set([region, country, state].filter(Boolean))].join(", ").slice(0, 200);
    const description = htmlToText(rssTag(item, "description"));
    const skills = commaValues(rssTag(item, "skills"));
    const job: NormalizedExternalJob = {
      source: "weworkremotely",
      sourceName: "We Work Remotely",
      externalId,
      title: parts.title.slice(0, 200),
      company: parts.company.slice(0, 200),
      location,
      workMode: "remote",
      employmentType: employmentType(rssTag(item, "type")),
      technologies: skills.slice(0, 50),
      description,
      postedAt: isoDate(rssTag(item, "pubDate")),
      url: url.toString(),
    };
    const keywordHaystack = `${job.title}\n${job.company}\n${job.technologies.join(" ")}\n${job.description}`;
    if (filters.keywords && !includesTerms(keywordHaystack, filters.keywords)) return [];
    if (filters.location && !includesTerms(job.location, filters.location)) return [];
    return [job];
  });
}

export function parseWeWorkRemotelyDescriptionHtml(html: string): string {
  const scripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const script of scripts) {
    try {
      const value = JSON.parse(script[1] ?? "") as unknown;
      const candidates = Array.isArray(value) ? value : [value];
      for (const candidate of candidates) {
        if (candidate && typeof candidate === "object" && "description" in candidate && typeof candidate.description === "string") {
          return htmlToText(candidate.description);
        }
      }
    } catch {
      // Ignore unrelated or malformed structured-data blocks.
    }
  }
  return "";
}
