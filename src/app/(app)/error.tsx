"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Unexpected application error", { digest: error.digest ?? "unavailable" });
  }, [error]);

  return <section className="empty-state" role="alert"><span className="empty-icon">!</span><h1>Something went wrong</h1><p>We could not load this part of your workspace. Your saved data was not changed.</p><button className="button button-primary" onClick={() => retry()}>Try again</button></section>;
}
