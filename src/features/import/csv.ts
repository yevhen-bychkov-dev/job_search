import { jobDuplicateKey, parseJobInput } from "../jobs/domain.ts";
import type { JobInput } from "../jobs/types.ts";

export type CsvPreviewRow = {
  rowNumber: number;
  raw: Record<string, string>;
  job: JobInput | null;
  errors: Record<string, string>;
  duplicateKey: string;
};

export type CsvPreview = {
  headers: string[];
  rows: CsvPreviewRow[];
  fatalError: string;
};

const HEADER_ALIASES: Record<string, keyof JobInput> = {
  title: "title",
  "job title": "title",
  position: "title",
  role: "title",
  company: "company",
  organization: "company",
  organisation: "company",
  employer: "company",
  status: "status",
  source: "source",
  "source url": "sourceUrl",
  url: "sourceUrl",
  link: "sourceUrl",
  location: "location",
  "work mode": "workMode",
  workplace: "workMode",
  "employment type": "employmentType",
  "job type": "employmentType",
  salary: "salary",
  compensation: "salary",
  description: "description",
  technologies: "technologies",
  technology: "technologies",
  "tech stack": "technologies",
  notes: "notes",
  "date discovered": "discoveredOn",
  "discovered on": "discoveredOn",
  "date applied": "appliedOn",
  "applied on": "appliedOn",
};

function normalizeHeader(value: string): string {
  return value.trim().toLocaleLowerCase("en").replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (inQuotes) throw new Error("The CSV contains an unclosed quoted field.");
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

export function previewCsv(text: string, defaultDate?: string): CsvPreview {
  if (new TextEncoder().encode(text).byteLength > 750_000) {
    return { headers: [], rows: [], fatalError: "CSV files must be 750 KB or smaller." };
  }
  let matrix: string[][];
  try {
    matrix = parseCsv(text.replace(/^\uFEFF/, ""));
  } catch (error) {
    return {
      headers: [],
      rows: [],
      fatalError: error instanceof Error ? error.message : "The CSV could not be parsed.",
    };
  }
  if (matrix.length < 2) {
    return { headers: matrix[0] ?? [], rows: [], fatalError: "Include a header and at least one data row." };
  }

  const headers = matrix[0].map((header) => header.trim());
  const mapped = headers.map((header) => HEADER_ALIASES[normalizeHeader(header)] ?? null);
  if (!mapped.includes("title") || !mapped.includes("company")) {
    return {
      headers,
      rows: [],
      fatalError: "Map or name columns for both job title and company.",
    };
  }

  const seen = new Set<string>();
  const rows = matrix.slice(1, 501).map((cells, rowIndex): CsvPreviewRow => {
    const raw = Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() ?? ""]));
    const input: Record<string, unknown> = {};
    mapped.forEach((field, index) => {
      if (field) input[field] = cells[index]?.trim() ?? "";
    });
    const parsed = parseJobInput(input, { defaultDate });
    if (!parsed.ok) {
      return { rowNumber: rowIndex + 2, raw, job: null, errors: parsed.errors, duplicateKey: "" };
    }
    const duplicateKey = jobDuplicateKey(parsed.data);
    if (seen.has(duplicateKey)) {
      return {
        rowNumber: rowIndex + 2,
        raw,
        job: parsed.data,
        errors: { duplicate: "Duplicate of an earlier row in this CSV." },
        duplicateKey,
      };
    }
    seen.add(duplicateKey);
    return { rowNumber: rowIndex + 2, raw, job: parsed.data, errors: {}, duplicateKey };
  });

  return {
    headers,
    rows,
    fatalError: matrix.length > 501 ? "Only the first 500 data rows can be imported at once." : "",
  };
}

export type NormalizedJobInput = JobInput & { sourceRecordId?: string };

export interface VacancySourceAdapter {
  readonly sourceName: string;
  fetchNormalizedJobs(): Promise<NormalizedJobInput[]>;
}
