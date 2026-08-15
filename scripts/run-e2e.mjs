import { spawn } from "node:child_process";
import process from "node:process";

const nextBin = "node_modules/next/dist/bin/next";
const playwrightBin = "node_modules/playwright/cli.js";
const testEnvironment = { ...process.env, PLAYWRIGHT_TEST_MODE: "1" };

function run(args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: process.cwd(), env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${args.join(" ")} exited with ${code ?? signal ?? "unknown status"}.`));
    });
  });
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

async function stopServer(server) {
  if (!server.pid || server.exitCode !== null) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      killer.once("exit", resolve);
      killer.once("error", resolve);
    });
  } else {
    server.kill("SIGTERM");
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 2_000);
      server.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    if (server.exitCode === null) server.kill("SIGKILL");
  }
}

await run([nextBin, "build"]);
const server = spawn(process.execPath, [nextBin, "start", "--port", "3100"], {
  cwd: process.cwd(),
  env: testEnvironment,
  stdio: "inherit",
});

let exitCode = 0;
try {
  await waitForServer("http://localhost:3100/login", 60_000);
  await run([playwrightBin, "test", ...process.argv.slice(2)], testEnvironment);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  await stopServer(server);
}

process.exit(exitCode);
