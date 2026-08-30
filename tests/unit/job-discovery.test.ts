import assert from "node:assert/strict";
import test from "node:test";

import {
  externalJobToJobInput,
  filterKnownExternalJobs,
  newestFirst,
  paginateExternalJobs,
  parseDiscoveryFilters,
  parseExternalJob,
} from "../../src/features/job-discovery/domain.ts";
import { normalizeJustJoinOffer } from "../../src/lib/job-sources/justjoin/normalize.ts";
import {
  parseJustJoinDescriptionHtml,
  parseJustJoinSearchResponse,
} from "../../src/lib/job-sources/justjoin/parse.ts";
import {
  buildJustJoinSearchUrl,
  justJoinPagesToFetch,
} from "../../src/lib/job-sources/justjoin/search.ts";
import {
  mergeNoFluffJobs,
  normalizeNoFluffPosting,
  parseNoFluffJobDescription,
  parseNoFluffSearchPage,
} from "../../src/lib/job-sources/nofluffjobs/normalize.ts";
import {
  buildNoFluffSearchRequest,
  MAX_NO_FLUFF_RESULTS,
  noFluffPagesToFetch,
} from "../../src/lib/job-sources/nofluffjobs/search.ts";
import { fetchWithTransientRetry } from "../../src/lib/job-sources/fetch-with-retry.ts";
import { normalizeDouFeed } from "../../src/lib/job-sources/dou/normalize.ts";
import { buildDouFeedUrl } from "../../src/lib/job-sources/dou/search.ts";
import type { JobSearchFilters, NormalizedExternalJob } from "../../src/lib/job-sources/types.ts";
import { normalizeWeWorkRemotelyFeed } from "../../src/lib/job-sources/weworkremotely/normalize.ts";
import { buildWeWorkRemotelyFeedUrl } from "../../src/lib/job-sources/weworkremotely/search.ts";

function job(externalId: string, postedAt?: string): NormalizedExternalJob {
  return {
    source: "justjoinit",
    sourceName: "JustJoinIT",
    externalId,
    title: `Engineer ${externalId}`,
    company: "Synthetic Labs",
    location: "Warszawa",
    workMode: "remote",
    employmentType: "full_time",
    technologies: ["TypeScript"],
    description: "Synthetic test data.",
    postedAt,
    url: `https://justjoin.it/job-offer/synthetic-${externalId}`,
  };
}

test("normalizes a JustJoinIT offer without leaking source-specific fields", () => {
  const normalized = normalizeJustJoinOffer({
    guid: "external-guid",
    slug: "synthetic-frontend-engineer",
    title: "Frontend Engineer",
    companyName: "Synthetic Labs",
    city: "Warszawa",
    workplaceType: "office",
    workingTime: "full_time",
    publishedAt: "2026-08-15T12:00:00.000Z",
    requiredSkills: ["React", "TypeScript"],
    niceToHaveSkills: ["React", "Next.js"],
    employmentTypes: [
      { from: 4000, to: 5000, currency: "EUR", currencySource: "conversion", unit: "month" },
      { from: 17000, to: 22000, currency: "PLN", currencySource: "original", unit: "month" },
    ],
  });
  assert.ok(normalized);
  assert.equal(normalized.externalId, "external-guid");
  assert.equal(normalized.workMode, "onsite");
  assert.deepEqual(normalized.technologies, ["React", "TypeScript", "Next.js"]);
  assert.deepEqual(normalized.salary, { min: 17000, max: 22000, currency: "PLN", unit: "month" });
  assert.equal(normalized.url, "https://justjoin.it/job-offer/synthetic-frontend-engineer");
});

test("builds and parses current JustJoinIT 100-job cursor pages", () => {
  const url = buildJustJoinSearchUrl({
    keywords: "React",
    location: "Łódź",
    workModes: ["remote", "onsite"],
    categories: ["javascript"],
    technologies: [],
    seniorities: ["mid", "senior"],
  }, 200);
  assert.equal(url.pathname, "/api/candidate-api/offers");
  assert.equal(url.searchParams.get("from"), "200");
  assert.equal(url.searchParams.get("itemsCount"), "100");
  assert.equal(url.searchParams.get("keywords"), "React");
  assert.equal(url.searchParams.get("city"), "Łódź");
  assert.deepEqual(url.searchParams.getAll("remoteWorkOptions"), ["remote", "office"]);
  assert.deepEqual(url.searchParams.getAll("experienceLevels"), ["mid", "senior"]);
  assert.equal(url.searchParams.get("sortBy"), "publishedAt");
  assert.equal(url.searchParams.get("orderBy"), "descending");

  const parsed = parseJustJoinSearchResponse({
    data: [{ guid: "one", slug: "one", title: "One", companyName: "Synthetic One" }],
    meta: { totalItems: 245, next: { cursor: 200, itemsCount: 100 } },
  });
  assert.equal(parsed.totalItems, 245);
  assert.equal(parsed.batchSize, 1);
  assert.equal(parsed.hasMore, true);
  assert.equal(justJoinPagesToFetch(0), 1);
  assert.equal(justJoinPagesToFetch(245), 3);
  assert.equal(justJoinPagesToFetch(10_000), 5);
});

test("normalizes current JustJoinIT skill objects and per-unit salary", () => {
  const normalized = normalizeJustJoinOffer({
    guid: "current-contract",
    slug: "current-contract",
    title: "Frontend Engineer",
    companyName: "Synthetic Labs",
    workplaceType: "remote",
    workingTime: "full_time",
    requiredSkills: [{ name: "React", level: 3 }, { name: "TypeScript", level: 3 }],
    employmentTypes: [{
      from: 18_480,
      fromPerUnit: 110,
      to: 23_520,
      toPerUnit: 140,
      currency: "PLN",
      currencySource: "original",
      unit: "Hour",
    }],
  });
  assert.ok(normalized);
  assert.deepEqual(normalized.technologies, ["React", "TypeScript"]);
  assert.deepEqual(normalized.salary, { min: 110, max: 140, currency: "PLN", unit: "Hour" });
});

test("filters saved, ignored, and repeated external identities", () => {
  const filtered = filterKnownExternalJobs(
    [job("saved"), job("ignored"), job("legacy-url"), job("new"), job("new")],
    { saved: ["saved"], ignored: ["ignored"], savedUrls: ["https://justjoin.it/job-offer/synthetic-legacy-url?utm_source=old"] },
  );
  assert.deepEqual(filtered.map((item) => item.externalId), ["new"]);
});

test("sorts by publication time newest first and leaves unknown dates last", () => {
  const sorted = newestFirst([
    job("older", "2026-08-12T09:00:00.000Z"),
    job("unknown"),
    job("newer", "2026-08-15T09:00:00.000Z"),
  ]);
  assert.deepEqual(sorted.map((item) => item.externalId), ["newer", "older", "unknown"]);
});

test("paginates discovery results at exactly 100 jobs per page", () => {
  const jobs = Array.from({ length: 205 }, (_, index) => job(String(index + 1)));
  const first = paginateExternalJobs(jobs, 1);
  const second = paginateExternalJobs(jobs, 2);
  const last = paginateExternalJobs(jobs, 99);
  assert.equal(first.jobs.length, 100);
  assert.equal(first.startIndex, 0);
  assert.equal(second.jobs.length, 100);
  assert.equal(second.startIndex, 100);
  assert.equal(last.page, 3);
  assert.equal(last.jobs.length, 5);
});

test("maps a bulk selection into existing saved-job inputs with stable identities", () => {
  const inputs = [job("one"), job("two")].map(externalJobToJobInput);
  assert.equal(inputs.length, 2);
  assert.ok(inputs.every((input) => input.status === "saved"));
  assert.deepEqual(inputs.map((input) => [input.externalSource, input.externalJobId]), [
    ["justjoinit", "one"],
    ["justjoinit", "two"],
  ]);
});

test("extracts and decodes the standards-based detail description", () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "JobPosting",
    description: "Build React &amp; TypeScript systems.",
  })}</script>`;
  assert.equal(parseJustJoinDescriptionHtml(html), "Build React & TypeScript systems.");
});

test("validates provider filter arrays without accepting arbitrary shapes", () => {
  assert.deepEqual(parseDiscoveryFilters({
    keywords: "React",
    location: "Warszawa",
    workModes: ["remote"],
    categories: ["frontend"],
    technologies: ["react", "typescript"],
    seniorities: ["senior"],
  }), {
    keywords: "React",
    location: "Warszawa",
    workModes: ["remote"],
    categories: ["frontend"],
    technologies: ["react", "typescript"],
    seniorities: ["senior"],
  });
  assert.equal(parseDiscoveryFilters({ workModes: [], categories: ["frontend", "backend"] }), null);
  assert.equal(parseDiscoveryFilters({ workModes: [], technologies: ["<script>"] }), null);
});

test("builds the current NoFluffJobs search request with real criteria and required pagination parameters", () => {
  const request = buildNoFluffSearchRequest({
    keywords: "React",
    location: "Łódź",
    workModes: ["hybrid"],
    categories: ["frontend"],
    technologies: ["typescript"],
    seniorities: ["senior"],
  }, 3);
  assert.equal(request.url.pathname, "/api/search/posting");
  assert.equal(request.url.searchParams.get("page"), "3");
  assert.equal(request.url.searchParams.get("limit"), "100");
  assert.equal(request.url.searchParams.get("sort"), "newest");
  assert.equal(request.url.searchParams.get("salaryCurrency"), "PLN");
  assert.deepEqual(JSON.parse(request.body), {
    criteriaSearch: {
      keyword: ["React"],
      city: ["lodz"],
      category: ["frontend"],
      requirement: ["typescript"],
      seniority: ["senior"],
    },
  });
  const remote = buildNoFluffSearchRequest({
    keywords: "", location: "", workModes: ["remote"], categories: [], technologies: [], seniorities: [],
  }, 1);
  assert.deepEqual(JSON.parse(remote.body).criteriaSearch.city, ["remote"]);
  assert.equal(noFluffPagesToFetch(0), 1);
  assert.equal(noFluffPagesToFetch(4), 4);
  assert.equal(noFluffPagesToFetch(999), 5);
  assert.equal(MAX_NO_FLUFF_RESULTS, 500);
});

test("retries transient job-source responses without retrying permanent failures", async () => {
  const transientStatuses = [503, 429, 200];
  const waits: number[] = [];
  const transient = await fetchWithTransientRetry("https://example.com/jobs", {}, {
    fetcher: async () => new Response("", { status: transientStatuses.shift() ?? 500 }),
    wait: async (delayMs) => { waits.push(delayMs); },
  });
  assert.equal(transient.status, 200);
  assert.deepEqual(waits, [200, 400]);

  let permanentAttempts = 0;
  const permanent = await fetchWithTransientRetry("https://example.com/jobs", {}, {
    fetcher: async () => {
      permanentAttempts += 1;
      return new Response("", { status: 400 });
    },
    wait: async () => undefined,
  });
  assert.equal(permanent.status, 400);
  assert.equal(permanentAttempts, 1);
});

test("retries a transient job-source network failure", async () => {
  let attempts = 0;
  const response = await fetchWithTransientRetry("https://example.com/jobs", {}, {
    fetcher: async () => {
      attempts += 1;
      if (attempts === 1) throw new TypeError("synthetic network failure");
      return new Response("ok");
    },
    wait: async () => undefined,
  });
  assert.equal(await response.text(), "ok");
  assert.equal(attempts, 2);
});

test("builds and normalizes the official DOU vacancy feed", () => {
  const filters: JobSearchFilters = {
    keywords: "React", location: "Warszawa", workModes: ["remote"],
    categories: ["Front End"], technologies: [], seniorities: [],
  };
  const url = buildDouFeedUrl(filters);
  assert.equal(url.hostname, "jobs.dou.ua");
  assert.equal(url.pathname, "/vacancies/feeds/");
  assert.equal(url.searchParams.get("search"), "React Warszawa");
  assert.equal(url.searchParams.get("category"), "Front End");

  const jobs = normalizeDouFeed(`<?xml version="1.0"?><rss><channel><item>
    <title>Senior React &amp;amp; TypeScript Engineer в Synthetic DOU Studio, Варшава, віддалено</title>
    <link>https://jobs.dou.ua/companies/synthetic-dou/vacancies/400001/?utm_source=jobsrss</link>
    <description>&lt;p&gt;Build React and TypeScript products on Azure.&lt;/p&gt;</description>
    <pubDate>Thu, 27 Aug 2026 12:15:36 +0300</pubDate>
  </item></channel></rss>`, filters);
  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0], {
    source: "dou",
    sourceName: "DOU",
    externalId: "400001",
    title: "Senior React & TypeScript Engineer",
    company: "Synthetic DOU Studio",
    location: "Варшава, віддалено",
    workMode: "remote",
    employmentType: "unspecified",
    technologies: ["Front End", "TypeScript", "React", "Azure"],
    description: "Build React and TypeScript products on Azure.",
    postedAt: "2026-08-27T09:15:36.000Z",
    url: "https://jobs.dou.ua/companies/synthetic-dou/vacancies/400001/",
  });
});

test("builds and locally filters the public We Work Remotely feed", () => {
  const filters: JobSearchFilters = {
    keywords: "TypeScript React", location: "European Union", workModes: ["remote"],
    categories: ["front-end"], technologies: [], seniorities: [],
  };
  const url = buildWeWorkRemotelyFeedUrl(filters);
  assert.equal(url.toString(), "https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss");
  const jobs = normalizeWeWorkRemotelyFeed(`<?xml version="1.0"?><rss><channel><item>
    <title>Synthetic Global Co: Remote TypeScript Engineer</title>
    <region>European Union</region><country>Poland</country><state></state>
    <skills>TypeScript, React, Accessibility</skills><type>Full-Time</type>
    <description>&lt;p&gt;Build accessible React products with TypeScript.&lt;/p&gt;</description>
    <link>https://weworkremotely.com/remote-jobs/synthetic-global-co-remote-typescript-engineer</link>
    <guid>https://weworkremotely.com/remote-jobs/synthetic-global-co-remote-typescript-engineer</guid>
    <pubDate>Thu, 27 Aug 2026 18:22:56 +0000</pubDate>
  </item></channel></rss>`, filters);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0]?.externalId, "synthetic-global-co-remote-typescript-engineer");
  assert.equal(jobs[0]?.company, "Synthetic Global Co");
  assert.equal(jobs[0]?.title, "Remote TypeScript Engineer");
  assert.equal(jobs[0]?.location, "European Union, Poland");
  assert.equal(jobs[0]?.workMode, "remote");
  assert.equal(jobs[0]?.employmentType, "full_time");
  assert.deepEqual(jobs[0]?.technologies, ["TypeScript", "React", "Accessibility"]);
  assert.equal(parseExternalJob(jobs[0])?.source, "weworkremotely");
  assert.equal(parseExternalJob(jobs[0])?.url, jobs[0]?.url);
  assert.equal(parseExternalJob({ ...jobs[0], url: "https://example.com/remote-jobs/fake" }), null);
});

test("normalizes and merges NoFluffJobs multi-location postings by stable reference", () => {
  const base = {
    id: "senior-frontend-synthetic-warszawa",
    reference: "NFJ-REF-1",
    name: "Synthetic No Fluff Studio",
    title: "Senior Frontend Engineer",
    posted: Date.parse("2026-08-15T10:00:00.000Z"),
    salary: { from: 22000, to: 28000, currency: "PLN", period: "Month", type: "b2b" },
    tiles: { values: [
      { value: "frontend", type: "category" },
      { value: "React", type: "requirement" },
      { value: "TypeScript", type: "requirement" },
    ] },
  };
  const office = normalizeNoFluffPosting({
    ...base,
    url: "senior-frontend-synthetic-warszawa",
    location: { fullyRemote: false, hybridDesc: "2 days weekly", places: [{ city: "Warszawa" }] },
  });
  const remote = normalizeNoFluffPosting({
    ...base,
    url: "senior-frontend-synthetic-remote",
    location: { fullyRemote: true, hybridDesc: "", places: [{ city: "Remote" }] },
  });
  assert.ok(office);
  assert.ok(remote);
  const merged = mergeNoFluffJobs([office, remote]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.externalId, "NFJ-REF-1");
  assert.equal(merged[0]?.workMode, "remote");
  assert.equal(merged[0]?.employmentType, "contract");
  assert.deepEqual(merged[0]?.technologies, ["React", "TypeScript"]);
  assert.deepEqual(merged[0]?.salary, { min: 22000, max: 28000, currency: "PLN", unit: "month" });
});

test("parses NoFluffJobs pagination metadata and readable detail HTML", () => {
  const parsed = parseNoFluffSearchPage({
    postings: [{ reference: "one" }],
    totalCount: 145,
    totalPages: 3,
  });
  assert.equal(parsed.postings.length, 1);
  assert.equal(parsed.totalCount, 145);
  assert.equal(parsed.totalPages, 3);
  assert.equal(parseNoFluffJobDescription({
    requirements: { description: "<p>Build React &amp; TypeScript systems.</p><ul><li>Own accessibility.</li></ul>" },
  }), "Build React & TypeScript systems.\nOwn accessibility.");
});

test("accepts only the normalized NoFluffJobs URL contract for imported jobs", () => {
  const normalized = normalizeNoFluffPosting({
    reference: "NFJ-REF-2",
    id: "frontend-engineer-synthetic-warszawa",
    url: "frontend-engineer-synthetic-warszawa",
    title: "Frontend Engineer",
    name: "Synthetic Studio",
    location: { places: [{ city: "Warszawa" }] },
  });
  assert.ok(normalized);
  assert.ok(parseExternalJob(normalized));
  assert.equal(parseExternalJob({ ...normalized, url: "https://example.com/pl/job/fake" }), null);
});
