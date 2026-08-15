"use client";

import {
  type FormEvent,
  type MouseEvent,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";

import { WORK_MODE_LABELS, type WorkMode } from "@/features/jobs/types";
import type { JobSearchFilters, JobSourceId, NormalizedExternalJob } from "@/lib/job-sources/types";

import {
  addExternalJobsAction,
  ignoreExternalJobAction,
  loadExternalJobDetailsAction,
  searchExternalJobsAction,
} from "./actions";
import { formatExternalSalary } from "./domain";

const PAGE_SIZE = 25;
const EMPTY_FILTERS: JobSearchFilters = { keywords: "", location: "", workModes: [] };

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

export function DiscoveryWorkspace({ sources }: { sources: ReadonlyArray<{ id: JobSourceId; name: string }> }) {
  const [activeSource, setActiveSource] = useState<JobSourceId>(sources[0]?.id ?? "justjoinit");
  const [filtersBySource, setFiltersBySource] = useState<Record<JobSourceId, JobSearchFilters>>({ justjoinit: EMPTY_FILTERS });
  const [jobs, setJobs] = useState<NormalizedExternalJob[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drawerJob, setDrawerJob] = useState<NormalizedExternalJob | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [sourceInfo, setSourceInfo] = useState({ total: 0, batchLimit: 0, hasMore: false });
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [isSearching, startSearch] = useTransition();
  const [isBulkAdding, startBulkAdd] = useTransition();
  const selectAllRef = useRef<HTMLInputElement>(null);
  const filters = filtersBySource[activeSource];
  const visibleJobs = jobs.slice(0, visibleCount);
  const visibleIds = visibleJobs.map((job) => job.externalId);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id));

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
  }, [allVisibleSelected, someVisibleSelected]);

  function updateFilters(patch: Partial<JobSearchFilters>) {
    setFiltersBySource((current) => ({
      ...current,
      [activeSource]: { ...current[activeSource], ...patch },
    }));
  }

  function runSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setSearchError("");
    startSearch(async () => {
      const result = await searchExternalJobsAction(activeSource, filters);
      setHasSearched(true);
      setSelectedIds(new Set());
      setDrawerJob(null);
      setVisibleCount(PAGE_SIZE);
      if (result.status === "error") {
        setJobs([]);
        setSearchError(result.message);
        return;
      }
      setJobs(result.jobs);
      setSourceInfo({ total: result.sourceResultCount, batchLimit: result.sourceBatchLimit, hasMore: result.sourceHasMore });
    });
  }

  function toggleMode(mode: WorkMode) {
    updateFilters({
      workModes: filters.workModes.includes(mode)
        ? filters.workModes.filter((value) => value !== mode)
        : [...filters.workModes, mode],
    });
  }

  function toggleSelected(externalId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(externalId)) next.delete(externalId); else next.add(externalId);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function addJobs(toAdd: NormalizedExternalJob[]) {
    setBusyIds((current) => new Set([...current, ...toAdd.map((job) => job.externalId)]));
    const result = await addExternalJobsAction(toAdd);
    if (result.status === "success") {
      const processed = new Set(result.processedExternalIds);
      setJobs((current) => current.filter((job) => !processed.has(job.externalId)));
      setSelectedIds((current) => new Set([...current].filter((id) => !processed.has(id))));
      if (drawerJob && processed.has(drawerJob.externalId)) setDrawerJob(null);
      setNotice({ kind: "success", message: result.message });
    } else {
      setNotice({ kind: "error", message: result.message });
    }
    setBusyIds((current) => {
      const next = new Set(current);
      toAdd.forEach((job) => next.delete(job.externalId));
      return next;
    });
  }

  function addSelected() {
    const toAdd = jobs.filter((job) => selectedIds.has(job.externalId));
    startBulkAdd(async () => addJobs(toAdd));
  }

  async function hideJob(job: NormalizedExternalJob) {
    setBusyIds((current) => new Set(current).add(job.externalId));
    const result = await ignoreExternalJobAction(job.source, job.externalId);
    if (result.status === "success") {
      setJobs((current) => current.filter((item) => item.externalId !== job.externalId));
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(job.externalId);
        return next;
      });
      if (drawerJob?.externalId === job.externalId) setDrawerJob(null);
      setNotice({ kind: "success", message: result.message });
    } else {
      setNotice({ kind: "error", message: result.message });
    }
    setBusyIds((current) => {
      const next = new Set(current);
      next.delete(job.externalId);
      return next;
    });
  }

  function rowClick(event: MouseEvent<HTMLTableRowElement>, job: NormalizedExternalJob) {
    if ((event.target as HTMLElement).closest("button,input,a")) return;
    setDrawerJob(job);
  }

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
            onClick={() => setActiveSource(source.id)}
          >{source.name}</button>
        ))}
      </div>

      <form className="card discovery-filters" onSubmit={runSearch} aria-label="Discover jobs filters">
        <div className="field">
          <label htmlFor="discovery-keywords">Keywords or technologies</label>
          <input id="discovery-keywords" value={filters.keywords} maxLength={120} placeholder="React, TypeScript, frontend…" onChange={(event) => updateFilters({ keywords: event.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="discovery-location">Location</label>
          <input id="discovery-location" value={filters.location} maxLength={120} placeholder="Warszawa or leave blank" onChange={(event) => updateFilters({ location: event.target.value })} />
        </div>
        <fieldset className="discovery-mode-fieldset">
          <legend>Work mode</legend>
          {(["remote", "hybrid", "onsite"] as const).map((mode) => (
            <label key={mode}><input type="checkbox" checked={filters.workModes.includes(mode)} onChange={() => toggleMode(mode)} /> {WORK_MODE_LABELS[mode]}</label>
          ))}
        </fieldset>
        <button className="button button-primary discovery-search-button" type="submit" disabled={isSearching}>{isSearching ? "Searching…" : "Search"}</button>
      </form>

      {notice && <p className={`alert alert-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.message}</p>}
      {searchError && <section className="empty-state compact" role="alert"><span className="empty-icon">!</span><h2>Source unavailable</h2><p>{searchError}</p></section>}
      {!hasSearched && !isSearching && <section className="empty-state"><span className="empty-icon">⌕</span><h2>Search current vacancies</h2><p>Choose filters, then select Search. Filters never send requests automatically.</p></section>}
      {isSearching && <div className="page-loading" role="status"><span className="spinner" />Searching JustJoinIT…</div>}
      {hasSearched && !isSearching && !searchError && jobs.length === 0 && <section className="empty-state"><span className="empty-icon">0</span><h2>No new jobs found</h2><p>Try broader filters. Jobs already saved or hidden are removed automatically.</p></section>}

      {jobs.length > 0 && !isSearching && (
        <section className="stack" aria-labelledby="discovery-results-heading">
          <div className="discovery-results-toolbar">
            <div><h2 id="discovery-results-heading">Search results</h2><p>{jobs.length} new of {sourceInfo.total} source matches</p></div>
            <button className="button button-primary" type="button" disabled={selectedIds.size === 0 || isBulkAdding} onClick={addSelected}>{isBulkAdding ? "Adding…" : `Add selected (${selectedIds.size})`}</button>
          </div>
          {sourceInfo.hasMore && <p className="alert discovery-limit-note">JustJoinIT returned its newest {sourceInfo.batchLimit} matches. Refine filters to reach older vacancies.</p>}
          <div className="card table-wrap">
            <table className="discovery-table">
              <thead><tr>
                <th className="selection-cell"><input ref={selectAllRef} type="checkbox" aria-label="Select all displayed jobs" checked={allVisibleSelected} onChange={toggleSelectAll} /></th>
                <th>Title</th><th>Company</th><th>Location</th><th>Work mode</th><th>Technologies</th><th>Posted</th><th>Actions</th>
              </tr></thead>
              <tbody>{visibleJobs.map((job) => {
                const busy = busyIds.has(job.externalId);
                return <tr key={`${job.source}:${job.externalId}`} className="discovery-row" onClick={(event) => rowClick(event, job)}>
                  <td className="selection-cell"><input type="checkbox" aria-label={`Select ${job.title} at ${job.company}`} checked={selectedIds.has(job.externalId)} onChange={() => toggleSelected(job.externalId)} /></td>
                  <td><button className="discovery-title-button" type="button" onClick={() => setDrawerJob(job)}>{job.title}</button></td>
                  <td>{job.company}</td><td>{job.location || "—"}</td><td>{WORK_MODE_LABELS[job.workMode]}</td>
                  <td><span className="technology-cell" title={job.technologies.join(", ")}>{job.technologies.slice(0, 3).join(", ") || "—"}{job.technologies.length > 3 ? ` +${job.technologies.length - 3}` : ""}</span></td>
                  <td><time dateTime={job.postedAt}>{postedDate(job.postedAt)}</time></td>
                  <td><div className="discovery-row-actions"><button type="button" className="text-button" disabled={busy} onClick={() => void addJobs([job])}>Add</button><button type="button" className="text-button danger" disabled={busy} onClick={() => void hideJob(job)}>Hide</button></div></td>
                </tr>;
              })}</tbody>
            </table>
            <p className="table-note">Showing {visibleJobs.length} of {jobs.length} new vacancies, newest first.</p>
          </div>
          {visibleCount < jobs.length && <button className="button button-secondary load-more-button" type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>Load more</button>}
        </section>
      )}

      {drawerJob && <DiscoveryDrawer
        job={drawerJob}
        busy={busyIds.has(drawerJob.externalId)}
        onClose={() => setDrawerJob(null)}
        onAdd={() => addJobs([drawerJob])}
        onHide={() => hideJob(drawerJob)}
        onDescription={(description) => {
          setJobs((current) => current.map((job) => job.externalId === drawerJob.externalId ? { ...job, description } : job));
          setDrawerJob((current) => current ? { ...current, description } : current);
        }}
      />}
    </div>
  );
}
