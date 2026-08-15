"use client";

export default function AppError({ unstable_retry }: { error: Error; unstable_retry: () => void }) {
  return <section className="empty-state" role="alert"><span className="empty-icon">!</span><h1>Something went wrong</h1><p>We could not load this part of your workspace. Your saved data was not changed.</p><button className="button button-primary" onClick={() => unstable_retry()}>Try again</button></section>;
}
