export type SupabasePublicEnvironment = {
  url: string;
  publishableKey: string;
};

export function getSupabaseEnvironment(): SupabasePublicEnvironment {
  const url = process.env.NEXT_PUBLIC_JOB_SEARCH_SUPABASE_URL;
  const publishableKey = process.env.JOB_SEARCH_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey || url === "PASTE_HERE" || publishableKey === "PASTE_HERE") {
    throw new Error(
      "Supabase is not configured. Copy .env.example to .env.local and replace both PASTE_HERE values.",
    );
  }
  try {
    const parsed = new URL(url);
    const isSecure = parsed.protocol === "https:";
    const isLocal = parsed.protocol === "http:" && ["127.0.0.1", "localhost"].includes(parsed.hostname);
    if (!isSecure && !isLocal) throw new Error();
  } catch {
    throw new Error("NEXT_PUBLIC_JOB_SEARCH_SUPABASE_URL must be a valid Supabase https URL.");
  }
  return { url, publishableKey };
}

export function isPlaywrightTestMode(): boolean {
  return process.env.PLAYWRIGHT_TEST_MODE === "1" && process.env.VERCEL !== "1";
}
