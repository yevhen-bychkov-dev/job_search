import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./database.types";
import { getSupabaseEnvironment } from "./environment";

export function createBrowserSupabaseClient() {
  const { url, publishableKey } = getSupabaseEnvironment();
  return createBrowserClient<Database>(url, publishableKey);
}
