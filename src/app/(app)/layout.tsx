import { Sidebar } from "@/components/navigation/sidebar";
import { requireIdentity } from "@/features/auth/session";
import { connection } from "next/server";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const identity = await requireIdentity();
  return <div className="app-shell"><Sidebar identity={identity} /><main className="content-shell" id="main-content">{children}</main></div>;
}
