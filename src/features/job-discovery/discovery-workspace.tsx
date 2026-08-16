"use client";

import {
  type FormEvent,
  type MouseEvent,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";

import { WORK_MODE_LABELS } from "@/features/jobs/types";
import type {
  JobSearchFilters,
  JobSourceDefinition,
  JobSourceId,
  NormalizedExternalJob,
} from "@/lib/job-sources/types";

import {
  addExternalJobsAction,
  ignoreExternalJobAction,
  loadExternalJobDetailsAction,
  searchExternalJobsAction,
} from "./actions";
import { formatExternalSalary } from "./domain";
import { SourceSearchForm } from "./source-search-form";

const PAGE_SIZE = 25;

function emptyFilters(): JobSearchFilters {
  return {
    keywords: "",
    location: "",
    workModes: [],
    categories: [],
    technologies: [],
    seniorities: [],
  };
}

type SourceSearchState = {
  jobs: NormalizedExternalJob[];
  selectedIds: Set<string>;
  visibleCount: number;
  hasSearched: boolean;
  searchError: string;
  sourceInfo: { total: number; batchLimit: number; hasMore: boolean };
};

function emptySearchState(): SourceSearchState {
  return {
    jobs: [],
    selectedIds: new Set(),
    visibleCount: PAGE_SIZE,
    hasSearched: false,
    searchError: "",
    sourceInfo: { total: 0, batchLimit: 0, hasMore: false },
  };
}

function jobKey(job: Pick<NormalizedExternalJob, "source" | "externalId">): string {
  return `${job.source}:${job.externalId}`;
}

function postedDate(value?: string): string {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "Europe/Warsaw",
  }).format(new Date(value));
}

function DiscoveryDrawer({
  job,
  busy,
  onClose,
  onAdd,
  onHide,
  onDescription,
}: {
  job: NormalizedExternalJob;
  busy: boolean;
  onClose: () => void;
  onAdd: () => Promise<void>;
  onHide: () => Promise<void>;
  onDescription: (description: string) => void;
}) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [detailState, setDetailState] = useState<"idle" | "loading" | "error">(job.description ? "idle" : "loading");

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.classList.add("drawer-open");
    closeRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = [...drawerRef.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      )];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1) ?? first;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.classList.remove("drawer-open");
      previous?.focus();
    };
  }, [onClose]);

  useEffect(() => {
    if (job.description) return;
    let active = true;
    void loadExternalJobDetailsAction(job).then((result) => {
      if (!active) return;
      if (result.status === "success") {
        onDescription(result.description);
        setDetailState("idle");
      } else {
        setDetailState("error");
      }
    });
    return () => { active = false; };
  }, [job, onDescription]);

  return (
    <div className="discovery-drawer-layer">
      <button className="discovery-drawer-overlay" type="button" aria-label="Close job details" onClick={onClose} />
      <aside
        className="discovery-drawer"
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="discovery-drawer-title"
      >
        <header className="discovery-drawer-header">
          <div>
            <span className="eyebrow">{job.sourceName}</span>
            <h2 id="discovery-drawer-title">{job.title}</h2>
            <p>{job.company}</p>
          </div>
          <button ref={closeRef} className="icon-button" type="button" onClick={onClose} aria-label="Close job details">×</button>
        </header>

        <div className="discovery-drawer-body">
          <dl className="definition-list discovery-definition-list">
            <div><dt>Location</dt><dd>{job.location || "Not specified"}</dd></div>
            <div><dt>Work mode</dt><dd>{WORK_MODE_LABELS[job.workMode]}</dd></div>
            <div><dt>Published</dt><dd>{postedDate(job.postedAt)}</dd></div>
            <div><dt>Salary</dt><dd>{formatExternalSalary(job.salary) || "Not disclosed"}</dd></div>
            <div><dt>Source</dt><dd>{job.sourceName}</dd></div>
          </dl>

          {job.technologies.length > 0 && (
            <section aria-labelledby="drawer-technologies">
              <h3 id="drawer-technologies">Technologies</h3>
              <div className="tag-list">{job.technologies.map((technology) => <span className="tag" key={technology}>{technology}</span>)}</div>
            </section>
          )}

          <section aria-labelledby="drawer-description">
            <h3 id="drawer-description">Job description</h3>
            {detailState === "loading" && <p className="drawer-detail-state" role="status"><span className="spinner" /> Loading description…</p>}
            {detailState === "error" && <p className="alert alert-error" role="alert">The full description is temporarily unavailable. You can still open the source vacancy.</p>}
            {job.description && <p className="rich-copy">{job.description}</p>}
          </section>
        </div>

        <footer className="discovery-drawer-footer">
          <a className="button button-secondary" href={job.url} target="_blank" rel="noreferrer">Open source vacancy</a>
          <button className="button button-danger" type="button" disabled={busy} onClick={() => void onHide()}>Hide</button>
          <button className="button button-primary" type="button" disabled={busy} onClick={() => void onAdd()}>{busy ? "Working…" : "Add job"}</button>
        </footer>
      </aside>
    </div>
  );
}

export function DiscoveryWorkspace({ sources }: { sources: ReadonlyArray<JobSourceDefinition> }) {
  const [activeSource, setActiveSource] = useState<JobSourceId>(sources[0]?.id ?? "justjoinit");
  const [filtersBySource, setFiltersBySource] = useState<Record<JobSourceId, JobSearchFilters>>({
    justjoinit: emptyFilters(),
    nofluffjobs: emptyFilters(),
  });
  const [searchBySource, setSearchBySource] = useState<Record<JobSourceId, SourceSearchState>>({
    justjoinit: emptySearchState(),
    nofluffjobs: emptySearchState(),
  });
  const [drawerJob, setDrawerJob] = useState<NormalizedExternalJob | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [searchingSources, setSearchingSources] = useState<Set<JobSourceId>>(new Set());
  const [, startSearch] = useTransition();
  const [isBulkAdding, startBulkAdd] = useTransition();
  const selectAllRef = useRef<HTMLInputElement>(null);
  const source = sources.find((item) => item.id === activeSource) ?? sources[0];
  const filters = filtersBySource[activeSource];
  const searchState = searchBySource[activeSource];
  const { jobs, selectedIds, visibleCount, hasSearched, searchError, sourceInfo } = searchState;
  const visibleJobs = jobs.slice(0, visibleCount);
  const visibleIds = visibleJobs.map((job) => job.externalId);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id));
  const isSearching = searchingSources.has(activeSource);

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
  }, [allVisibleSelected, someVisibleSelected]);

  function updateFilters(patch: Partial<JobSearchFilters>) {
    setFiltersBySource((current) => ({
      ...current,
      [activeSource]: { ...current[activeSource], ...patch },
    }));
  }

  function updateSearchState(
    sourceId: JobSourceId,
    update: (current: SourceSearchState) => SourceSearchState,
  ) {
    setSearchBySource((current) => ({ ...current, [sourceId]: update(current[sourceId]) }));
  }

  function runSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedSource = activeSource;
    const submittedFilters = filtersBySource[submittedSource];
    setNotice(null);
    setSearchingSources((current) => new Set(current).add(submittedSource));
    updateSearchState(submittedSource, (current) => ({ ...current, searchError: "" }));
    startSearch(async () => {
      try {
        const result = await searchExternalJobsAction(submittedSource, submittedFilters);
        updateSearchState(submittedSource, (current) => ({
          ...current,
          jobs: result.status === "success" ? result.jobs : [],
          selectedIds: new Set(),
          visibleCount: PAGE_SIZE,
          hasSearched: true,
          searchError: result.status === "error" ? result.message : "",
          sourceInfo: result.status === "success"
            ? { total: result.sourceResultCount, batchLimit: result.sourceBatchLimit, hasMore: result.sourceHasMore }
            : current.sourceInfo,
        }));
        setDrawerJob((current) => current?.source === submittedSource ? null : current);
      } finally {
        setSearchingSources((current) => {
          const next = new Set(current);
          next.delete(submittedSource);
          return next;
        });
      }
    });
  }

  function toggleSelected(externalId: string) {
    updateSearchState(activeSource, (current) => {
      const next = new Set(current.selectedIds);
      if (next.has(externalId)) next.delete(externalId); else next.add(externalId);
      return { ...current, selectedIds: next };
    });
  }

  function toggleSelectAll() {
    updateSearchState(activeSource, (current) => {
      const next = new Set(current.selectedIds);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return { ...current, selectedIds: next };
    });
  }

  async function addJobs(toAdd: NormalizedExternalJob[]) {
    const sourceId = toAdd[0]?.source;
    if (!sourceId || toAdd.some((job) => job.source !== sourceId)) {
      setNotice({ kind: "error", message: "Select jobs from one source and try again." });
      return;
    }
    setBusyIds((current) => new Set([...current, ...toAdd.map(jobKey)]));
    const result = await addExternalJobsAction(toAdd);
    if (result.status === "success") {
      const processed = new Set(result.processedExternalIds);
      updateSearchState(sourceId, (current) => ({
        ...current,
        jobs: current.jobs.filter((job) => !processed.has(job.externalId)),
        selectedIds: new Set([...current.selectedIds].filter((id) => !processed.has(id))),
      }));
      if (drawerJob?.source === sourceId && processed.has(drawerJob.externalId)) setDrawerJob(null);
      setNotice({ kind: "success", message: result.message });
    } else {
      setNotice({ kind: "error", message: result.message });
    }
    setBusyIds((current) => {
      const next = new Set(current);
      toAdd.forEach((job) => next.delete(jobKey(job)));
      return next;
    });
  }

  function addSelected() {
    const toAdd = jobs.filter((job) => selectedIds.has(job.externalId));
    startBulkAdd(async () => addJobs(toAdd));
  }

  async function hideJob(job: NormalizedExternalJob) {
    setBusyIds((current) => new Set(current).add(jobKey(job)));
    const result = await ignoreExternalJobAction(job.source, job.externalId);
    if (result.status === "success") {
      updateSearchState(job.source, (current) => {
        const next = new Set(current.selectedIds);
        next.delete(job.externalId);
        return {
          ...current,
          jobs: current.jobs.filter((item) => item.externalId !== job.externalId),
          selectedIds: next,
        };
      });
      if (drawerJob?.source === job.source && drawerJob.externalId === job.externalId) setDrawerJob(null);
      setNotice({ kind: "success", message: result.message });
    } else {
      setNotice({ kind: "error", message: result.message });
    }
    setBusyIds((current) => {
      const next = new Set(current);
      next.delete(jobKey(job));
      return next;
    });
  }

  function rowClick(event: MouseEvent<HTMLTableRowElement>, job: NormalizedExternalJob) {
    if ((event.target as HTMLElement).closest("button,input,a")) return;
    setDrawerJob(job);
  }

  if (!source) return null;

  return (
    <div className="stack discovery-workspace">
      <div className="source-tabs" role="tablist" aria-label="Job sources">
        {sources.map((source) => (
          <button
            key={source.id}
            type="button"
            role="tab"
            aria-selected={activeSource === source.id}
            className={activeSource === source.id ? "source-tab active" : "source-tab"}
            onClick={() => {
              setActiveSource(source.id);
              setDrawerJob(null);
              setNotice(null);
            }}
          >{source.name}</button>
        ))}
      </div>

      <SourceSearchForm
        source={source}
        filters={filters}
        busy={isSearching}
        onUpdate={updateFilters}
        onSubmit={runSearch}
      />

      {notice && <p className={`alert alert-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.message}</p>}
      {searchError && <section className="empty-state compact" role="alert"><span className="empty-icon">!</span><h2>Source unavailable</h2><p>{searchError}</p></section>}
      {!hasSearched && !isSearching && <section className="empty-state"><span className="empty-icon">⌕</span><h2>Search current vacancies</h2><p>Choose filters, then select Search. Filters never send requests automatically.</p></section>}
      {isSearching && <div className="page-loading" role="status"><span className="spinner" />Searching {source.name}…</div>}
      {hasSearched && !isSearching && !searchError && jobs.length === 0 && <section className="empty-state"><span className="empty-icon">0</span><h2>No new jobs found</h2><p>Try broader filters. Jobs already saved or hidden are removed automatically.</p></section>}

      {jobs.length > 0 && !isSearching && (
        <section className="stack" aria-labelledby={`discovery-results-heading-${activeSource}`}>
          <div className="discovery-results-toolbar">
            <div><h2 id={`discovery-results-heading-${activeSource}`}>Search results</h2><p>{jobs.length} new of {sourceInfo.total} source matches</p></div>
            <button className="button button-primary" type="button" disabled={selectedIds.size === 0 || isBulkAdding} onClick={addSelected}>{isBulkAdding ? "Adding…" : `Add selected (${selectedIds.size})`}</button>
          </div>
          {sourceInfo.hasMore && <p className="alert discovery-limit-note">{source.name} returned its newest {sourceInfo.batchLimit} matches. Refine filters to reach older vacancies.</p>}
          <div className="card table-wrap">
            <table className="discovery-table">
              <thead><tr>
                <th className="selection-cell"><input ref={selectAllRef} type="checkbox" aria-label="Select all displayed jobs" checked={allVisibleSelected} onChange={toggleSelectAll} /></th>
                <th>Title</th><th>Company</th><th>Location</th><th>Work mode</th><th>Technologies</th><th>Source</th><th>Posted</th><th>Actions</th>
              </tr></thead>
              <tbody>{visibleJobs.map((job) => {
                const busy = busyIds.has(jobKey(job));
                return <tr key={`${job.source}:${job.externalId}`} className="discovery-row" onClick={(event) => rowClick(event, job)}>
                  <td className="selection-cell"><input type="checkbox" aria-label={`Select ${job.title} at ${job.company}`} checked={selectedIds.has(job.externalId)} onChange={() => toggleSelected(job.externalId)} /></td>
                  <td><button className="discovery-title-button" type="button" onClick={() => setDrawerJob(job)}>{job.title}</button></td>
                  <td>{job.company}</td><td>{job.location || "—"}</td><td>{WORK_MODE_LABELS[job.workMode]}</td>
                  <td><span className="technology-cell" title={job.technologies.join(", ")}>{job.technologies.slice(0, 3).join(", ") || "—"}{job.technologies.length > 3 ? ` +${job.technologies.length - 3}` : ""}</span></td>
                  <td>{job.sourceName}</td>
                  <td><time dateTime={job.postedAt}>{postedDate(job.postedAt)}</time></td>
                  <td><div className="discovery-row-actions"><button type="button" className="text-button" disabled={busy} onClick={() => void addJobs([job])}>Add</button><button type="button" className="text-button danger" disabled={busy} onClick={() => void hideJob(job)}>Hide</button></div></td>
                </tr>;
              })}</tbody>
            </table>
            <p className="table-note">Showing {visibleJobs.length} of {jobs.length} new vacancies, newest first.</p>
          </div>
          {visibleCount < jobs.length && <button className="button button-secondary load-more-button" type="button" onClick={() => updateSearchState(activeSource, (current) => ({ ...current, visibleCount: current.visibleCount + PAGE_SIZE }))}>Load more</button>}
        </section>
      )}

      {drawerJob && <DiscoveryDrawer
        job={drawerJob}
        busy={busyIds.has(jobKey(drawerJob))}
        onClose={() => setDrawerJob(null)}
        onAdd={() => addJobs([drawerJob])}
        onHide={() => hideJob(drawerJob)}
        onDescription={(description) => {
          updateSearchState(drawerJob.source, (current) => ({
            ...current,
            jobs: current.jobs.map((job) => job.externalId === drawerJob.externalId ? { ...job, description } : job),
          }));
          setDrawerJob((current) => current ? { ...current, description } : current);
        }}
      />}
    </div>
  );
}
