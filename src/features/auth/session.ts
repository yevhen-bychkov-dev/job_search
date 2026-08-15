import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { isPlaywrightTestMode } from "@/lib/supabase/environment";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const TEST_SESSION_COOKIE = "job-search-test-session";
export const TEST_IDENTITY = {
  userId: "11111111-1111-4111-8111-111111111111",
  email: "demo.user@example.test",
} as const;

export type Identity = { userId: string; email: string };

export async function getOptionalIdentity(): Promise<Identity | null> {
  if (isPlaywrightTestMode()) {
    const authenticated = (await cookies()).get(TEST_SESSION_COOKIE)?.value === "authenticated";
    return authenticated ? TEST_IDENTITY : null;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims.sub) return null;
  return {
    userId: data.claims.sub,
    email: typeof data.claims.email === "string" ? data.claims.email : "Authenticated account",
  };
}

export async function requireIdentity(): Promise<Identity> {
  const identity = await getOptionalIdentity();
  if (!identity) redirect("/login");
  return identity;
}
