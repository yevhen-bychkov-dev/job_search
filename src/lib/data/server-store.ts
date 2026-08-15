import "server-only";

import { isPlaywrightTestMode } from "@/lib/supabase/environment";

import type { AppStore } from "./contracts";
import { MemoryAppStore } from "./memory-store";
import { SupabaseAppStore } from "./supabase-store";

let memoryStore: MemoryAppStore | undefined;

export function getAppStore(): AppStore {
  if (isPlaywrightTestMode()) {
    memoryStore ??= new MemoryAppStore();
    return memoryStore;
  }
  return new SupabaseAppStore();
}
