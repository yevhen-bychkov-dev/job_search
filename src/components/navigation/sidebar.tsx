import { signOutAction } from "@/features/auth/actions";
import type { Identity } from "@/features/auth/session";

import { SubmitButton } from "../ui/submit-button";
import { Icon } from "../ui/icon";
import { NavLinks } from "./nav-links";

export function Sidebar({ identity }: { identity: Identity }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">J</span>
        <div><strong>Job Search OS</strong><span>Personal workspace</span></div>
      </div>
      <NavLinks />
      <div className="sidebar-footer">
        <div className="sidebar-account">
          <span className="avatar" aria-hidden="true">{identity.email.slice(0, 1).toUpperCase()}</span>
          <div className="account-copy"><strong>Signed in as</strong><span title={identity.email}>{identity.email}</span></div>
          <form action={signOutAction}>
            <SubmitButton className="sidebar-signout" pendingLabel="Signing out…"><Icon name="logout" size={18} /><span className="sr-only">Sign out</span></SubmitButton>
          </form>
        </div>
        <div className="sidebar-encouragement">
          <span className="encouragement-icon"><Icon name="rocket" size={30} /></span>
          <div><strong>Keep going!</strong><p>Small steps lead<br />to big opportunities.</p></div>
        </div>
      </div>
    </aside>
  );
}
