"use client";

import { useEffect, useRef } from "react";

import { Icon } from "@/components/ui/icon";

export function WorkspaceSearch() {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", focusSearch);
    return () => document.removeEventListener("keydown", focusSearch);
  }, []);

  return (
    <form className="workspace-search" action="/jobs" method="get" role="search" aria-label="Workspace job search">
      <button type="submit" aria-label="Submit job search" title="Search jobs"><Icon name="search" /></button>
      <label className="sr-only" htmlFor="workspace-search">Search workspace jobs</label>
      <input ref={inputRef} id="workspace-search" type="search" name="search" maxLength={100} placeholder="Search jobs, companies, or technologies…" aria-keyshortcuts="Control+k Meta+k" />
      <kbd aria-hidden="true">Ctrl K</kbd>
    </form>
  );
}
