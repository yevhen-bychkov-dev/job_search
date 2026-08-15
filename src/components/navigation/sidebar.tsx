import { signOutAction } from "@/features/auth/actions";
import type { Identity } from "@/features/auth/session";

import { SubmitButton } from "../ui/submit-button";
import { NavLinks } from "./nav-links";

export function Sidebar({ identity }: { identity: Identity }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">J</span>
        <div><strong>Job Search OS</strong><span>Personal workspace</span></div>
      </div>
      <NavLinks />
      <div className="sidebar-account">
        <span className="avatar" aria-hidden="true">{identity.email.slice(0, 1).toUpperCase()}</span>
        <div className="account-copy"><strong>Signed in</strong><span title={identity.email}>{identity.email}</span></div>
        <form action={signOutAction}>
          <SubmitButton className="icon-button" pendingLabel="…">Sign out</SubmitButton>
        </form>
      </div>
    </aside>
  );
}
