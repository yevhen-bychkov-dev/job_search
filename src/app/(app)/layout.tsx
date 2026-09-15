import { Sidebar } from "@/components/navigation/sidebar";
import { Topbar } from "@/components/navigation/topbar";
import { requireIdentity } from "@/features/auth/session";
import { connection } from "next/server";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const identity = await requireIdentity();
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Sidebar identity={identity} />
      <div className="workspace-shell">
        <Topbar initial={identity.email.slice(0, 1).toUpperCase()} />
        <main className="content-shell" id="main-content" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
