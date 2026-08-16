"use client";

import type { FormEvent } from "react";

import { WORK_MODE_LABELS, type WorkMode } from "@/features/jobs/types";
import type {
  JobSearchFilters,
  JobSourceDefinition,
  JobSourceFilterOption,
} from "@/lib/job-sources/types";

function optionSelect(
  id: string,
  label: string,
  options: readonly JobSourceFilterOption[],
  selected: string[],
  onChange: (value: string[]) => void,
) {
  if (options.length === 0) return null;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={selected[0] ?? ""} onChange={(event) => onChange(event.target.value ? [event.target.value] : [])}>
        <option value="">All</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}

export function SourceSearchForm({
  source,
  filters,
  busy,
  onUpdate,
  onSubmit,
}: {
  source: JobSourceDefinition;
  filters: JobSearchFilters;
  busy: boolean;
  onUpdate: (patch: Partial<JobSearchFilters>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  function toggleMode(mode: WorkMode) {
    onUpdate({
      workModes: filters.workModes.includes(mode)
        ? filters.workModes.filter((value) => value !== mode)
        : [...filters.workModes, mode],
    });
  }

  function toggleSeniority(value: string) {
    onUpdate({
      seniorities: filters.seniorities.includes(value)
        ? filters.seniorities.filter((item) => item !== value)
        : [...filters.seniorities, value],
    });
  }

  const prefix = `discovery-${source.id}`;
  return (
    <form className="card discovery-filters" onSubmit={onSubmit} aria-label={`Search ${source.name} filters`}>
      <div className="discovery-filter-grid">
        <div className="field">
          <label htmlFor={`${prefix}-keywords`}>Keywords or technologies</label>
          <input
            id={`${prefix}-keywords`}
            value={filters.keywords}
            maxLength={120}
            placeholder="React, TypeScript, frontend…"
            onChange={(event) => onUpdate({ keywords: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-location`}>Location</label>
          <input
            id={`${prefix}-location`}
            value={filters.location}
            maxLength={120}
            placeholder="Warszawa or leave blank"
            onChange={(event) => onUpdate({ location: event.target.value })}
          />
        </div>
        {optionSelect(
          `${prefix}-category`,
          "Category",
          source.filterOptions.categories,
          filters.categories,
          (categories) => onUpdate({ categories }),
        )}
        {optionSelect(
          `${prefix}-technology`,
          "Technology",
          source.filterOptions.technologies,
          filters.technologies,
          (technologies) => onUpdate({ technologies }),
        )}
      </div>

      <div className="discovery-filter-options">
        <fieldset className="discovery-mode-fieldset">
          <legend>Work mode</legend>
          {(["remote", "hybrid", "onsite"] as const).map((mode) => (
            <label key={mode}>
              <input type="checkbox" checked={filters.workModes.includes(mode)} onChange={() => toggleMode(mode)} />
              {WORK_MODE_LABELS[mode]}
            </label>
          ))}
        </fieldset>
        {source.filterOptions.seniorities.length > 0 && (
          <fieldset className="discovery-mode-fieldset discovery-seniority-fieldset">
            <legend>Seniority</legend>
            {source.filterOptions.seniorities.map((option) => (
              <label key={option.value}>
                <input
                  type="checkbox"
                  checked={filters.seniorities.includes(option.value)}
                  onChange={() => toggleSeniority(option.value)}
                />
                {option.label}
              </label>
            ))}
          </fieldset>
        )}
        <button className="button button-primary discovery-search-button" type="submit" disabled={busy}>
          {busy ? `Searching ${source.name}…` : "Search"}
        </button>
      </div>
    </form>
  );
}
