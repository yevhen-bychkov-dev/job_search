import { NextResponse } from "next/server";

import { TEST_IDENTITY_COOKIE, TEST_SESSION_COOKIE } from "@/features/auth/session";
import { isPlaywrightTestMode } from "@/lib/supabase/environment";
import { getAppStore } from "@/lib/data/server-store";

export async function POST() {
  if (!isPlaywrightTestMode()) return new Response("Not found", { status: 404 });
  await getAppStore().resetForTests();
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(TEST_SESSION_COOKIE);
  response.cookies.delete(TEST_IDENTITY_COOKIE);
  return response;
}
