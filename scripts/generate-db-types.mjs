import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const supabaseCli = resolve(repositoryRoot, "node_modules/supabase/dist/supabase.js");
const result = spawnSync(process.execPath, [supabaseCli, "gen", "types", "typescript", "--local", "--schema", "public"], {
  cwd: repositoryRoot,
  encoding: "utf8",
  shell: false,
});

if (result.error) {
  console.error(`Unable to start the Supabase CLI: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}
if (!result.stdout.includes("export type Database")) {
  console.error("Supabase returned an unexpected type declaration; the existing database types were preserved.");
  process.exit(1);
}

writeFileSync(resolve(repositoryRoot, "src/lib/supabase/database.types.ts"), result.stdout, "utf8");
