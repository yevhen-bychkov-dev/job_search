import { NextResponse } from "next/server";

import { safeAuthDestination } from "@/features/auth/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { reportUnexpectedError } from "@/lib/server-errors";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const destination = safeAuthDestination(url.searchParams.get("next"));
  if (!code || code.length > 500) return NextResponse.redirect(new URL("/login?error=callback", url.origin));
  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL("/login?error=callback", url.origin));
    return NextResponse.redirect(new URL(destination, url.origin));
  } catch (error) {
    reportUnexpectedError("auth.callback", error);
    return NextResponse.redirect(new URL("/login?error=configuration", url.origin));
  }
}
