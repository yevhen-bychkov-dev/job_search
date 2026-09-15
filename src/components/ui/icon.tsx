import type { ReactNode } from "react";

const paths = {
  home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h5v-6h4v6h5V9" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12a22 22 0 0 0 18 0M10 13h4" /></>,
  archive: <><rect x="3" y="3" width="18" height="5" rx="1" /><path d="M5 8v12h14V8M10 12h4" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  board: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M15 3v18M5.5 7h1M11.5 7h1M17.5 7h1M5.5 11h1M11.5 11h1M17.5 15h1" /></>,
  filter: <path d="M3 4h18l-7 8v7l-4 2v-9L3 4Z" />,
  book: <><path d="M12 5C9 3 6 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1ZM12 5v15" /></>,
  upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 14v6h16v-6" /></>,
  user: <><circle cx="12" cy="7" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
  logout: <><path d="M9 3H4v18h5M10 12h11m-4-4 4 4-4 4" /></>,
  "chevron-down": <path d="m7 10 5 5 5-5" />,
  "chevron-right": <path d="m9 6 6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  "arrow-right": <path d="M4 12h16m-6-6 6 6-6 6" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 11h18" /></>,
  chart: <><path d="M3 21h18M5 20V11h3v9M11 20V3h3v17M17 20v-6h3v6" /></>,
  trend: <><path d="M3 3v18h18M6 14l5-5 4 3 6-7m-5 0h5v5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  users: <><circle cx="9" cy="7" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v3" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  trophy: <><path d="M8 3h8v7a4 4 0 0 1-8 0V3ZM8 5H3v3a4 4 0 0 0 5 4M16 5h5v3a4 4 0 0 1-5 4M12 14v5m-5 2h10M9 19h6" /></>,
  send: <path d="m21 3-6 18-4-8-8-4 18-6ZM11 13 21 3" />,
  document: <><path d="M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8M8 16h5" /></>,
  rocket: <><path d="M14 4c3-2 6-1 7-1 0 1 1 4-1 7l-7 7-6-6 7-7ZM7 11H3l4-6h6M13 17v4l6-4v-6M7 16c-3 0-4 2-4 5 3 0 5-1 5-4" /><circle cx="16" cy="8" r="1.5" /></>,
  check: <path d="m5 12 4 4L19 6" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}
