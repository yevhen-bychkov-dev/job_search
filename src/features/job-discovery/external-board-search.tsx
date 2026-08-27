"use client";

import { useMemo, useState } from "react";

import { SourceBadge } from "@/components/ui/source-badge";
import { WORK_MODE_LABELS, type WorkMode } from "@/features/jobs/types";
import {
  buildExternalJobBoardUrl,
  type ExternalJobBoardDefinition,
} from "@/lib/job-sources/external-boards";

export function ExternalBoardSearch({ board }: { board: ExternalJobBoardDefinition }) {
  const [keywords, setKeywords] = useState("");
  const [location, setLocation] = useState("");
  const [workModes, setWorkModes] = useState<WorkMode[]>([]);
  const searchUrl = useMemo(() => buildExternalJobBoardUrl(board.id, {
    keywords,
    location,
    workModes,
  }).toString(), [board.id, keywords, location, workModes]);

  function toggleMode(mode: WorkMode) {
    setWorkModes((current) => current.includes(mode)
      ? current.filter((value) => value !== mode)
      : [...current, mode]);
  }

  return (
    <section className="card external-board-panel" aria-labelledby={`external-board-${board.id}`}>
      <div className="external-board-heading">
        <SourceBadge source={board.name} />
        <div>
          <span className="eyebrow">{board.coverage}</span>
          <h2 id={`external-board-${board.id}`}>Search on {board.name}</h2>
          <p>{board.description}</p>
        </div>
      </div>
      <div className="discovery-filter-grid external-board-filter-grid">
        <div className="field">
          <label htmlFor={`external-${board.id}-keywords`}>Keywords or technologies</label>
          <input
            id={`external-${board.id}-keywords`}
            value={keywords}
            maxLength={120}
            placeholder="React, TypeScript, frontend…"
            onChange={(event) => setKeywords(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`external-${board.id}-location`}>Location</label>
          <input
            id={`external-${board.id}-location`}
            value={location}
            maxLength={120}
            placeholder="Poland, European Union, United States…"
            onChange={(event) => setLocation(event.target.value)}
          />
        </div>
      </div>
      <div className="external-board-actions">
        <fieldset className="discovery-mode-fieldset">
          <legend>Work mode</legend>
          {(["remote", "hybrid", "onsite"] as const).map((mode) => (
            <label key={mode}>
              <input type="checkbox" checked={workModes.includes(mode)} onChange={() => toggleMode(mode)} />
              {WORK_MODE_LABELS[mode]}
            </label>
          ))}
        </fieldset>
        <a className="button button-primary" href={searchUrl} target="_blank" rel="noreferrer">
          Open search on {board.name}
        </a>
      </div>
      <p className="external-board-note">
        This opens the board in a new tab. To track a vacancy here, add it manually or import it by CSV.
      </p>
    </section>
  );
}
