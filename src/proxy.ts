import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseEnvironment, isPlaywrightTestMode } from "@/lib/supabase/environment";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/jobs",
  "/board",
  "/filters",
  "/knowledge-base",
  "/import",
  "/account",
];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function loginRedirect(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (isPlaywrightTestMode()) {
    const authenticated = request.cookies.get("job-search-test-session")?.value === "authenticated";
    if (isProtected(pathname) && !authenticated) return loginRedirect(request);
    if (pathname === "/login" && authenticated) return NextResponse.redirect(new URL("/dashboard", request.url));
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  try {
    const { url, publishableKey } = getSupabaseEnvironment();
    const supabase = createServerClient<Database>(url, publishableKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    const { data } = await supabase.auth.getClaims();
    const authenticated = Boolean(data?.claims.sub);
    if (isProtected(pathname) && !authenticated) return loginRedirect(request);
    if (pathname === "/login" && authenticated) return NextResponse.redirect(new URL("/dashboard", request.url));
  } catch {
    if (isProtected(pathname)) return loginRedirect(request);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
