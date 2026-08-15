import { NextResponse } from "next/server";

import { isPlaywrightTestMode } from "@/lib/supabase/environment";
import { getAppStore } from "@/lib/data/server-store";

export async function POST() {
  if (!isPlaywrightTestMode()) return new Response("Not found", { status: 404 });
  await getAppStore().resetForTests();
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("job-search-test-session");
  return response;
}
