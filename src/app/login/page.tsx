import type { Metadata } from "next";

import { LoginForm } from "@/features/auth/login-form";
import { safeAuthDestination } from "@/features/auth/types";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const query = await searchParams;
  const signedOut = query.signedOut === "1";
  const callbackError = typeof query.error === "string";
  const next = safeAuthDestination(query.next);
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand"><span className="brand-mark">J</span><span>Job Search OS</span></div>
        <p className="eyebrow">Welcome back</p>
        <h1>Sign in to your workspace</h1>
        <p className="page-description">Your jobs, documents, and notes stay inside your private Supabase project.</p>
        {signedOut ? <p className="alert alert-success" role="status">You have been signed out.</p> : null}
        {callbackError ? <p className="alert alert-error" role="alert">The sign-in link could not be verified. Please sign in again.</p> : null}
        <LoginForm next={next} />
        <p className="auth-footnote">Use the email/password account created in your Supabase project.</p>
      </section>
      <aside className="auth-aside" aria-label="Product summary">
        <div>
          <p className="eyebrow light">A calmer job search</p>
          <h2>One private place for every opportunity.</h2>
          <ul><li>Track each job from discovery to decision.</li><li>See momentum and outcomes at a glance.</li><li>Bring your spreadsheet history with you.</li></ul>
        </div>
      </aside>
    </main>
  );
}
