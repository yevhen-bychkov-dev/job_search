import Link from "next/link";

import { Icon } from "@/components/ui/icon";

import { WorkspaceSearch } from "./workspace-search";

export function Topbar({ initial }: { initial: string }) {
  return (
    <header className="workspace-topbar">
      <WorkspaceSearch />
      <Link className="workspace-account" href="/account" aria-label="Open account">
        <span className="avatar" aria-hidden="true">{initial}</span>
        <span className="workspace-account-copy"><strong>Work smarter</strong><span>One step closer <span aria-hidden="true">✦</span></span></span>
        <Icon name="chevron-right" size={18} />
      </Link>
    </header>
  );
}
