export type AuthActionState = {
  status: "idle" | "error";
  message: string;
  errors?: { email?: string; password?: string };
};

export const INITIAL_AUTH_STATE: AuthActionState = { status: "idle", message: "" };

const ALLOWED_DESTINATIONS = new Set([
  "/dashboard",
  "/jobs",
  "/board",
  "/filters",
  "/knowledge-base",
  "/import",
  "/account",
]);

export function safeAuthDestination(value: unknown): string {
  if (typeof value !== "string") return "/dashboard";
  const path = value.split("?")[0];
  return ALLOWED_DESTINATIONS.has(path) ? value : "/dashboard";
}
