type KnownSource = {
  match: (value: string) => boolean;
  label: string;
  mark: string;
  tone: string;
};

const KNOWN_SOURCES: KnownSource[] = [
  { match: (value) => value.includes("justjoin"), label: "JustJoinIT", mark: "JJ", tone: "jj" },
  { match: (value) => value.includes("nofluff"), label: "NoFluffJobs", mark: "NF", tone: "nf" },
  { match: (value) => value === "dou" || value.includes("dou.ua"), label: "DOU", mark: "DOU", tone: "dou" },
  { match: (value) => value.includes("linkedin"), label: "LinkedIn", mark: "in", tone: "linkedin" },
  { match: (value) => value.includes("pracuj"), label: "Pracuj.pl", mark: "PL", tone: "pracuj" },
  { match: (value) => value.includes("weworkremotely") || value.includes("we work remotely"), label: "We Work Remotely", mark: "WWR", tone: "wwr" },
];

function fallbackMark(value: string): string {
  const words = value.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (words.length > 1) return words.slice(0, 3).map((word) => word[0]).join("").toLocaleUpperCase("en");
  return (words[0] ?? "?").slice(0, 3).toLocaleUpperCase("en");
}

export function SourceBadge({ source, externalSource, showLabel = false }: {
  source?: string;
  externalSource?: string;
  showLabel?: boolean;
}) {
  const raw = (externalSource || source || "Other source").trim();
  const normalized = raw.toLocaleLowerCase("en").replace(/[^a-z0-9.]+/g, "");
  const known = KNOWN_SOURCES.find((item) => item.match(normalized));
  const label = known?.label ?? raw;
  const mark = known?.mark ?? fallbackMark(raw);
  return (
    <span className="source-identity" title={`Source: ${label}`}>
      <span className={`source-badge source-badge-${known?.tone ?? "other"}`} aria-hidden="true">{mark}</span>
      {showLabel ? <span className="source-label">{label}</span> : <span className="sr-only">Source: {label}</span>}
    </span>
  );
}
