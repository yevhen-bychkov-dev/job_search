import "server-only";

type ErrorDescriptor = {
  name: string;
  code?: string;
};

function describeError(error: unknown): ErrorDescriptor {
  const name = error instanceof Error ? error.name : "NonErrorThrown";
  if (typeof error !== "object" || error === null || !("code" in error)) return { name };
  const code = error.code;
  return typeof code === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(code)
    ? { name, code }
    : { name };
}

export function reportUnexpectedError(context: string, error: unknown): void {
  console.error(`[${context}] unexpected failure`, describeError(error));
}
