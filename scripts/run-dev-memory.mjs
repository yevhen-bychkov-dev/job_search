import { spawn } from "node:child_process";
import process from "node:process";

const nextBin = "node_modules/next/dist/bin/next";
const child = spawn(process.execPath, [nextBin, "dev", ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: { ...process.env, PLAYWRIGHT_TEST_MODE: "1" },
  stdio: "inherit",
});

const forwardSignal = (signal) => child.kill(signal);
process.once("SIGINT", () => forwardSignal("SIGINT"));
process.once("SIGTERM", () => forwardSignal("SIGTERM"));

child.once("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.once("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
