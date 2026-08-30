import "server-only";

import { fetchWithTransientRetry } from "../fetch-with-retry";
import type { JobSearchFilters } from "../types";
import { parseNoFluffSearchPage, type ParsedNoFluffSearchPage } from "./normalize";
import { buildNoFluffSearchRequest } from "./search";

const DETAIL_ENDPOINT = "https://nofluffjobs.com/api/posting/";
// NFJ currently returns more than 6 MB for its first unfiltered result page,
// even when a smaller limit is requested.
const MAX_RESPONSE_BYTES = 10_000_000;

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
  const response = await fetchWithTransientRetry(request.url, {
    method: "POST",
    cache: "no-store",
    headers: {
      accept: "application/json",
      "content-type": "application/postingSearch+json",
      "user-agent": "JobSearchOS/0.1 personal-job-discovery",
    },
    body: request.body,
    redirect: "error",
  });
  return parseNoFluffSearchPage(await responseJson(response, "NoFluffJobs"));
}

export async function fetchNoFluffJobDetails(externalId: string): Promise<unknown> {
  if (!/^[A-Za-z0-9._:-]{1,200}$/.test(externalId)) {
    throw new Error("Invalid NoFluffJobs external identifier.");
  }
  const url = new URL(encodeURIComponent(externalId), DETAIL_ENDPOINT);
  const response = await fetchWithTransientRetry(url, {
    cache: "no-store",
    headers: {
      accept: "application/json",
      "user-agent": "JobSearchOS/0.1 personal-job-discovery",
    },
    redirect: "error",
  });
  return responseJson(response, "NoFluffJobs");
}
