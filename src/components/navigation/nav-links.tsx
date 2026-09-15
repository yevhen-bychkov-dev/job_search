"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: "home" },
  { href: "/jobs", label: "Jobs", icon: "briefcase" },
  { href: "/archived", label: "Archived", icon: "archive" },
  { href: "/jobs/discover", label: "Discover", icon: "search" },
  { href: "/board", label: "Board", icon: "board" },
  { href: "/filters", label: "Filters", icon: "filter" },
  { href: "/knowledge-base", label: "Knowledge Base", icon: "book" },
  { href: "/import", label: "Import", icon: "upload" },
  { href: "/account", label: "Account", icon: "user" },
] as const;

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="sidebar-nav" aria-label="Main navigation">
      {LINKS.map((link) => {
        const jobsDetail = link.href === "/jobs"
          && pathname !== "/jobs/discover"
          && (pathname === "/jobs" || pathname === "/jobs/new" || /^\/jobs\/[^/]+(?:\/edit)?$/.test(pathname));
        const active = jobsDetail || pathname === link.href || (link.href !== "/jobs" && pathname.startsWith(`${link.href}/`));
        return (
          <Link key={link.href} href={link.href} className={active ? "nav-link active" : "nav-link"} aria-current={active ? "page" : undefined} aria-label={link.label} title={link.label}>
            <span className="nav-icon" aria-hidden="true"><Icon name={link.icon} size={21} /></span>
            <span>{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
