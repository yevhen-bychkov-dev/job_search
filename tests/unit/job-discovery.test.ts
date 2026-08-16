import assert from "node:assert/strict";
import test from "node:test";

import {
  externalJobToJobInput,
  filterKnownExternalJobs,
  newestFirst,
  parseDiscoveryFilters,
  parseExternalJob,
} from "../../src/features/job-discovery/domain.ts";
import { normalizeJustJoinOffer } from "../../src/lib/job-sources/justjoin/normalize.ts";
import {
  parseJustJoinDescriptionHtml,
  parseJustJoinSearchHtml,
} from "../../src/lib/job-sources/justjoin/parse.ts";
import {
  mergeNoFluffJobs,
  normalizeNoFluffPosting,
  parseNoFluffJobDescription,
  parseNoFluffSearchPage,
} from "../../src/lib/job-sources/nofluffjobs/normalize.ts";
import {
  buildNoFluffSearchRequest,
  noFluffPagesToFetch,
} from "../../src/lib/job-sources/nofluffjobs/search.ts";
import type { NormalizedExternalJob } from "../../src/lib/job-sources/types.ts";

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

test("extracts the current JustJoinIT SSR search payload and cursor metadata", () => {
  const state = ["$", "component", null, { state: { queries: [{ state: { data: {
    pages: [{
      meta: { totalItems: 145, next: { cursor: 100, itemsCount: 100 } },
      data: [{ guid: "one", slug: "one", title: "One", companyName: "Synthetic One" }],
    }],
  } } }] } }];
  const flight = JSON.stringify([1, `19:${JSON.stringify(state)}\n`]);
  const parsed = parseJustJoinSearchHtml(`<html><script>self.__next_f.push(${flight})</script></html>`);
  assert.equal(parsed.totalItems, 145);
  assert.equal(parsed.batchSize, 1);
  assert.equal(parsed.hasMore, true);
  assert.equal(parsed.offers[0]?.guid, "one");
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
  assert.equal(request.url.searchParams.get("limit"), "50");
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
  assert.equal(noFluffPagesToFetch(999), 10);
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
