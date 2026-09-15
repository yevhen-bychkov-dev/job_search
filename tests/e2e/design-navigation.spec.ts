import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo.user@example.test");
  await page.getByLabel("Password").fill("DemoPass!123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.beforeEach(async ({ page }) => {
  expect(process.env.PLAYWRIGHT_TEST_MODE, "Design tests require the isolated synthetic E2E environment").toBe("1");
  const response = await page.request.post("/api/test/reset");
  expect(response.ok()).toBeTruthy();
  await signIn(page);
});

test("workspace search filters saved jobs through submit and keyboard shortcuts", async ({ page }) => {
  await page.getByRole("link", { name: "Import", exact: true }).click();
  const csv = [
    "Job Title,Company,Status,URL,Location,Tech Stack,Date Discovered",
    "Search Frontend Engineer,Synthetic North,Saved,https://example.test/jobs/search-north,Remote,React,2026-08-20",
    "Search Platform Engineer,Synthetic South,Saved,https://example.test/jobs/search-south,Warsaw,Python,2026-08-21",
  ].join("\n");
  await page.getByLabel("CSV file").setInputFiles({ name: "synthetic-search-jobs.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Import 2 valid jobs" }).click();
  await expect(page.getByText("Import complete.")).toBeVisible();

  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "Search workspace jobs" });
  await search.fill("Synthetic North");
  await page.getByRole("button", { name: "Submit job search" }).click();
  await expect(page).toHaveURL(/\/jobs\?search=Synthetic(?:\+|%20)North$/);
  await expect(page.getByRole("link", { name: /Search Frontend Engineer/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Search Platform Engineer/ })).toHaveCount(0);

  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await page.keyboard.press("Control+k");
  await expect(search).toBeFocused();
  await search.fill("Python");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/jobs\?search=Python$/);
  await expect(page.getByRole("link", { name: /Search Platform Engineer/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Search Frontend Engineer/ })).toHaveCount(0);

  await page.getByRole("link", { name: "Board", exact: true }).click();
  await page.keyboard.press("Meta+k");
  await expect(search).toBeFocused();
});

test("tablet navigation keeps complete accessible names and one active page", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  for (const label of ["Dashboard", "Jobs", "Archived", "Discover", "Board", "Filters", "Knowledge Base", "Import", "Account"]) {
    await expect(navigation.getByRole("link", { name: label, exact: true })).toBeVisible();
  }

  await navigation.getByRole("link", { name: "Discover", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Discover jobs", exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Discover", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(navigation.getByRole("link", { name: "Jobs", exact: true })).not.toHaveAttribute("aria-current", "page");
  await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);

  await navigation.getByRole("link", { name: "Jobs", exact: true }).click();
  await page.getByRole("link", { name: "Add job", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Add a job", exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Jobs", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
});

test("narrow shell supports skip navigation, search, and account access", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/dashboard");
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to content" });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main-content")).toBeFocused();

  await expect(page.getByRole("searchbox", { name: "Search workspace jobs" })).toBeVisible();
  const accountLink = page.getByRole("link", { name: "Open account", exact: true });
  await expect(accountLink).toBeVisible();
  const documentOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(documentOverflow, "The shared shell should fit a 320px viewport").toBeLessThanOrEqual(1);

  await accountLink.click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { name: "Account", exact: true })).toBeVisible();
});
