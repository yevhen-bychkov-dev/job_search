import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { signOutAction } from "@/features/auth/actions";
import { ResumeTemplateForm } from "@/features/cvs/resume-template-form";
import { requireIdentity } from "@/features/auth/session";
import { getAppStore } from "@/lib/data/server-store";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const identity = await requireIdentity();
  const query = await searchParams;
  const templates = await getAppStore().listResumeTemplates(identity.userId);
  const activeTemplate = templates.find((template) => template.active) ?? null;
  return <div className="page-stack page-narrow"><PageHeader eyebrow="Settings" title="Account" description="Review the identity connected to this private workspace." />{query.error === "signout" ? <p className="alert alert-error" role="alert">Sign-out could not be completed. Please try again.</p> : null}<section className="card account-card"><div className="avatar avatar-large" aria-hidden="true">{identity.email.slice(0, 1).toUpperCase()}</div><div><span className="detail-label">Signed-in email</span><h2>{identity.email}</h2><p className="muted">Authentication is managed by Supabase Auth. This MVP does not create a separate profile, team, role, or billing record.</p></div></section><section className="card stack"><div><p className="eyebrow">Resume output</p><h2>Resume Template</h2><p className="muted">The template controls the visual design. Gemini only creates structured resume content and never generates HTML or CSS.</p></div>{activeTemplate ? <p className="alert alert-success" role="status">Active template: <strong>{activeTemplate.originalName}</strong> · version {activeTemplate.version}</p> : <p className="alert alert-error" role="alert">No valid resume template is configured. Add one before generating a resume.</p>}<ResumeTemplateForm />{templates.length > 1 ? <p className="muted">{templates.length} template versions are retained for generated-resume provenance.</p> : null}</section><section className="card danger-zone"><div><h2>Sign out</h2><p>End this browser session and return to the login page.</p></div><form action={signOutAction}><SubmitButton className="button button-secondary" pendingLabel="Signing out…">Sign out</SubmitButton></form></section></div>;
}
