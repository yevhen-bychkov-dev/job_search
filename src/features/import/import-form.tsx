"use client";

import { useActionState, useMemo, useState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { dateInTimeZone } from "@/features/jobs/domain";

import { importCsvAction } from "./actions";
import { previewCsv } from "./csv";
import { INITIAL_IMPORT_STATE } from "./types";

export function ImportForm() {
  const [csv, setCsv] = useState("");
  const [filename, setFilename] = useState("");
  const [fileError, setFileError] = useState("");
  const [state, action] = useActionState(importCsvAction, INITIAL_IMPORT_STATE);
  const preview = useMemo(() => (csv ? previewCsv(csv, dateInTimeZone()) : null), [csv]);
  const validRows = preview?.rows.filter((row) => row.job && Object.keys(row.errors).length === 0).length ?? 0;

  return (
    <div className="stack-lg">
      <section className="form-card stack" aria-labelledby="choose-csv">
        <div>
          <h2 id="choose-csv">1. Choose a Google Sheets CSV export</h2>
          <p className="muted">The file is parsed in your browser for preview and validated again on import.</p>
        </div>
        <div className="field">
          <label htmlFor="csvFile">CSV file</label>
          <input
            id="csvFile"
            type="file"
            accept=".csv,text/csv"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              setFileError("");
              setCsv("");
              setFilename(file?.name ?? "");
              if (!file) return;
              if (file.size > 750_000) {
                setFileError("CSV files must be 750 KB or smaller.");
                return;
              }
              try {
                setCsv(await file.text());
              } catch {
                setCsv("");
                setFileError("The CSV file could not be read. Choose another file.");
              }
            }}
          />
          {filename ? <p className="field-help">Selected: {filename}</p> : null}
          {fileError ? <p className="field-error" role="alert">{fileError}</p> : null}
        </div>
      </section>

      {preview ? (
        <section className="card stack" aria-labelledby="preview-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Step 2</p>
              <h2 id="preview-heading">Review import preview</h2>
            </div>
            <span className="count-pill">{validRows} valid of {preview.rows.length}</span>
          </div>
          {preview.fatalError ? <p className="alert alert-error" role="alert">{preview.fatalError}</p> : null}
          {preview.rows.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Row</th><th>Job</th><th>Company</th><th>Status</th><th>Result</th></tr></thead>
                <tbody>
                  {preview.rows.slice(0, 25).map((row) => (
                    <tr key={row.rowNumber}>
                      <td>{row.rowNumber}</td>
                      <td>{row.job?.title ?? row.raw.Title ?? "—"}</td>
                      <td>{row.job?.company ?? row.raw.Company ?? "—"}</td>
                      <td>{row.job?.status ?? "—"}</td>
                      <td>{Object.keys(row.errors).length ? Object.values(row.errors).join(" ") : "Ready"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.rows.length > 25 ? <p className="table-note">Showing the first 25 rows.</p> : null}
            </div>
          ) : null}
          <form action={action}>
            <textarea className="sr-only" readOnly name="csv" value={csv} aria-label="CSV content" />
            <SubmitButton pendingLabel="Importing jobs…" className="button button-primary" >Import {validRows} valid jobs</SubmitButton>
          </form>
          {state.message ? (
            <div className={`alert alert-${state.status}`} role={state.status === "error" ? "alert" : "status"}>
              <strong>{state.message}</strong>
              {state.summary ? <span> Imported: {state.summary.imported}. Duplicates: {state.summary.duplicates}. Invalid: {state.summary.invalid}.</span> : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
