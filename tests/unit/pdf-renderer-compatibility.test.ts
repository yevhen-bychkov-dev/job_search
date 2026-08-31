import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as T;
}

test("serverless Chromium matches the browser major expected by Playwright", () => {
  const chromiumPackage = readJson<{ version: string }>("../../node_modules/@sparticuz/chromium/package.json");
  const playwrightBrowsers = readJson<{ browsers: Array<{ name: string; browserVersion?: string }> }>("../../node_modules/playwright-core/browsers.json");
  const expectedChromium = playwrightBrowsers.browsers.find((browser) => browser.name === "chromium");

  assert.ok(expectedChromium?.browserVersion, "Playwright must declare its expected Chromium version");
  assert.equal(
    chromiumPackage.version.split(".")[0],
    expectedChromium.browserVersion.split(".")[0],
    "@sparticuz/chromium and playwright-core must use the same Chromium major",
  );
});
