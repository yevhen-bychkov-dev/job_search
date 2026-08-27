"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: "⌁" },
  { href: "/jobs", label: "Jobs", icon: "▤" },
  { href: "/archived", label: "Archived", icon: "▱" },
  { href: "/jobs/discover", label: "Discover", icon: "⌕" },
  { href: "/board", label: "Board", icon: "▦" },
  { href: "/filters", label: "Filters", icon: "◇" },
  { href: "/knowledge-base", label: "Knowledge Base", icon: "▱" },
  { href: "/import", label: "Import", icon: "⇧" },
  { href: "/account", label: "Account", icon: "○" },
] as const;

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="sidebar-nav" aria-label="Main navigation">
      {LINKS.map((link) => {
        const jobsDetail = link.href === "/jobs"
          && (pathname === "/jobs" || pathname === "/jobs/new" || /^\/jobs\/[^/]+(?:\/edit)?$/.test(pathname));
        const active = jobsDetail || pathname === link.href || (link.href !== "/jobs" && pathname.startsWith(`${link.href}/`));
        return (
          <Link key={link.href} href={link.href} className={active ? "nav-link active" : "nav-link"} aria-current={active ? "page" : undefined}>
            <span className="nav-icon" aria-hidden="true">{link.icon}</span>
            <span>{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
