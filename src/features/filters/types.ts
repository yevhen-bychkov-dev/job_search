export type FilterSettings = {
  includedTechnologies: string[];
  excludedTechnologies: string[];
  preferredTitles: string[];
  updatedAt: string;
};

export const DEFAULT_FILTER_SETTINGS: Omit<FilterSettings, "updatedAt"> = {
  includedTechnologies: ["React", "TypeScript", "JavaScript", "Next.js", "Node.js"],
  excludedTechnologies: [],
  preferredTitles: [],
};
