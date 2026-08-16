import "server-only";

import type { JobSearchFilters } from "../types";
import { parseNoFluffSearchPage, type ParsedNoFluffSearchPage } from "./normalize";
import { buildNoFluffSearchRequest } from "./search";

const DETAIL_ENDPOINT = "https://nofluffjobs.com/api/posting/";
const MAX_RESPONSE_BYTES = 5_000_000;

async function responseJson(response: Response, source: string): Promise<unknown> {
  if (!response.ok) throw new Error(`${source} responded with ${response.status}.`);
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_RESPONSE_BYTES) throw new Error(`${source} response was too large.`);
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error(`${source} response was too large.`);
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`${source} returned invalid JSON.`, { cause: error });
  }
}

export async function fetchNoFluffSearchPage(
  filters: JobSearchFilters,
  page: number,
): Promise<ParsedNoFluffSearchPage> {
  const request = buildNoFluffSearchRequest(filters, page);
  const response = await fetch(request.url, {
    method: "POST",
    cache: "no-store",
    headers: {
      accept: "application/json",
      "content-type": "application/postingSearch+json",
      "user-agent": "JobSearchOS/0.1 personal-job-discovery",
    },
    body: request.body,
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  return parseNoFluffSearchPage(await responseJson(response, "NoFluffJobs"));
}

export async function fetchNoFluffJobDetails(externalId: string): Promise<unknown> {
  if (!/^[A-Za-z0-9._:-]{1,200}$/.test(externalId)) {
    throw new Error("Invalid NoFluffJobs external identifier.");
  }
  const url = new URL(encodeURIComponent(externalId), DETAIL_ENDPOINT);
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      accept: "application/json",
      "user-agent": "JobSearchOS/0.1 personal-job-discovery",
    },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  return responseJson(response, "NoFluffJobs");
}
