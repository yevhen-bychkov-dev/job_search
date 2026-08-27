import type { WorkMode } from "@/features/jobs/types";

export type ExternalJobBoardId = "dou" | "linkedin" | "pracuj" | "weworkremotely";

export type ExternalJobBoardDefinition = {
  id: ExternalJobBoardId;
  name: string;
  coverage: string;
  description: string;
  websiteUrl: string;
};

export type ExternalBoardSearch = {
  keywords: string;
  location: string;
  workModes: readonly WorkMode[];
};

export const EXTERNAL_JOB_BOARDS = [
  {
    id: "dou",
    name: "DOU",
    coverage: "Ukraine, EU time zones, and remote",
    description: "Technology vacancies with a strong Ukrainian and remote-market focus.",
    websiteUrl: "https://jobs.dou.ua/vacancies/",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    coverage: "Poland, European Union, and United States",
    description: "Broad company coverage and location-specific professional job search.",
    websiteUrl: "https://www.linkedin.com/jobs/search/",
  },
  {
    id: "pracuj",
    name: "Pracuj.pl",
    coverage: "Poland",
    description: "A broad Polish job board covering technology and other professional roles.",
    websiteUrl: "https://www.pracuj.pl/praca",
  },
  {
    id: "weworkremotely",
    name: "We Work Remotely",
    coverage: "Worldwide remote, including EU- and US-eligible roles",
    description: "Remote-first roles with each vacancy showing its geographic eligibility.",
    websiteUrl: "https://weworkremotely.com/remote-jobs",
  },
] as const satisfies ReadonlyArray<ExternalJobBoardDefinition>;

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

export function buildExternalJobBoardUrl(
  boardId: ExternalJobBoardId,
  search: ExternalBoardSearch,
): URL {
  const keywords = search.keywords.trim().slice(0, 120);
  const location = search.location.trim().slice(0, 120);
  if (boardId === "dou") {
    const url = new URL("https://jobs.dou.ua/vacancies/");
    const query = [keywords, location].filter(Boolean).join(" ");
    if (query) url.searchParams.set("search", query);
    if (search.workModes.includes("remote")) url.searchParams.set("remote", "");
    return url;
  }
  if (boardId === "linkedin") {
    const url = new URL("https://www.linkedin.com/jobs/search/");
    if (keywords) url.searchParams.set("keywords", keywords);
    if (location) url.searchParams.set("location", location);
    const workplaceCodes = search.workModes.flatMap((mode) => (
      mode === "onsite" ? ["1"] : mode === "remote" ? ["2"] : mode === "hybrid" ? ["3"] : []
    ));
    if (workplaceCodes.length > 0) url.searchParams.set("f_WT", workplaceCodes.join(","));
    return url;
  }
  if (boardId === "pracuj") {
    const keywordSlug = slug(keywords);
    const locationSlug = slug(location);
    const segments = [
      keywordSlug ? `${keywordSlug};kw` : "",
      locationSlug ? `${locationSlug};wp` : "",
    ].filter(Boolean);
    return new URL(segments.length > 0 ? `https://www.pracuj.pl/praca/${segments.join("/")}` : "https://www.pracuj.pl/praca");
  }
  const url = new URL("https://weworkremotely.com/remote-jobs/search");
  const term = [keywords, location].filter(Boolean).join(" ");
  if (term) url.searchParams.set("term", term);
  return url;
}
