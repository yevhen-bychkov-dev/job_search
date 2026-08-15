import { expect, test, type Page } from "@playwright/test";

const TEST_EMAIL = "demo.user@example.test";
const TEST_PASSWORD = "DemoPass!123";

async function reset(page: Page) {
  const response = await page.request.post("/api/test/reset");
  expect(response.ok()).toBeTruthy();
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(TEST_EMAIL);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await reset(page);
});

test("authentication, protected routes, navigation, and logout", async ({ page }) => {
  await page.goto("/jobs");
  await expect(page).toHaveURL(/\/login\?next=%2Fjobs$/);

  await page.getByLabel("Email").fill(TEST_EMAIL);
  await page.getByLabel("Password").fill("WrongPass!123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();

  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/jobs$/);
  await expect(page.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();

  for (const [name, path, heading] of [
    ["Dashboard", "/dashboard", "Dashboard"],
    ["Board", "/board", "Board"],
    ["Filters", "/filters", "Filters"],
    ["Knowledge Base", "/knowledge-base", "Knowledge Base"],
    ["Import", "/import", "Import from Google Sheets"],
    ["Account", "/account", "Account"],
  ] as const) {
    await page.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }

  await page.getByRole("button", { name: "Sign out" }).last().click();
  await expect(page).toHaveURL(/\/login\?signedOut=1$/);
  await expect(page.getByText("You have been signed out.")).toBeVisible();
});

test("job creation, list, detail, edit, board status, dashboard, and delete", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Add job" }).first().click();
  await page.getByLabel("Job title").fill("Frontend Engineer");
  await page.getByLabel("Company").fill("Synthetic Labs");
  await page.getByLabel("Status").selectOption("applied");
  await page.getByLabel("Source URL").fill("https://example.test/jobs/frontend?utm_source=e2e");
  await page.getByLabel("Location").fill("Warsaw");
  await page.getByLabel("Work mode").selectOption("hybrid");
  await page.getByLabel("Employment type").selectOption("full_time");
  await page.getByLabel("Date applied").fill("2026-08-15");
  await page.getByLabel("Technologies").fill("React, TypeScript, Next.js");
  await page.getByLabel("Description").fill("Synthetic role used only by deterministic browser tests.");
  await page.getByLabel("Private notes").fill("Synthetic note; contains no personal data.");
  await page.getByRole("button", { name: "Create job" }).click();

  await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]{36}\?created=1$/);
  await expect(page.getByRole("heading", { name: "Frontend Engineer" })).toBeVisible();
  await expect(page.getByText("Job created.")).toBeVisible();
  await expect(page.getByText("Synthetic role used only")).toBeVisible();

  await page.getByRole("link", { name: "Edit job" }).click();
  await page.getByLabel("Job title").fill("Senior Frontend Engineer");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Senior Frontend Engineer" })).toBeVisible();
  await expect(page.getByText("Job updated.")).toBeVisible();

  await page.getByRole("link", { name: "Board", exact: true }).click();
  await expect(page.getByRole("link", { name: /Senior Frontend Engineer/ })).toBeVisible();
  await page.getByLabel("Change job status").selectOption("interview");
  await page.getByRole("button", { name: "Update" }).click();
  await expect(page.getByText("Status updated.")).toBeVisible();
  await expect(page.locator('[aria-label="Jobs grouped by status"]')).toContainText("Senior Frontend Engineer");

  await page.getByRole("link", { name: "Jobs", exact: true }).click();
  await page.getByPlaceholder("Search title, company, technology…").fill("Senior");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("link", { name: /Senior Frontend Engineer/ })).toBeVisible();
  await page.getByRole("link", { name: /Senior Frontend Engineer/ }).click();
  await expect(page.getByText("Applied → Interview")).toBeVisible();

  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page.getByText("1", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("img", { name: "Jobs by status" })).toBeVisible();

  await page.getByRole("link", { name: "Jobs", exact: true }).click();
  await page.getByRole("link", { name: /Senior Frontend Engineer/ }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/jobs\?deleted=1$/);
  await expect(page.getByText("Job deleted.")).toBeVisible();
  await expect(page.getByText("No jobs yet")).toBeVisible();
});

test("filter editing and CSV import preview, validation, deduplication, and summary", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Filters", exact: true }).click();
  await expect(page.getByLabel("Included technologies")).toHaveValue(/React/);
  await page.getByLabel("Preferred job titles").fill("Frontend\nUI Engineer");
  await page.getByRole("button", { name: "Save filters" }).click();
  await expect(page.getByText("Filters saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Preferred job titles")).toHaveValue("Frontend\nUI Engineer");

  await page.getByRole("link", { name: "Import", exact: true }).click();
  const csv = [
    "Job Title,Company,Status,URL,Location,Tech Stack,Date Discovered",
    "UI Engineer,Synthetic Studio,Applied,https://example.test/jobs/ui,Warsaw,React|TypeScript,2026-08-01",
    "UI Engineer,Synthetic Studio,Applied,https://example.test/jobs/ui?utm_source=duplicate,Warsaw,React,2026-08-01",
    ",Invalid Synthetic Co,Saved,,Remote,React,2026-08-01",
  ].join("\n");
  await page.getByLabel("CSV file").setInputFiles({ name: "synthetic-jobs.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByRole("heading", { name: "Review import preview" })).toBeVisible();
  await expect(page.getByText("1 valid of 3")).toBeVisible();
  await page.getByRole("button", { name: "Import 1 valid jobs" }).click();
  await expect(page.getByText("Import complete.")).toBeVisible();
  await expect(page.getByText(/Imported: 1\. Duplicates: 1\. Invalid: 1\./)).toBeVisible();

  await page.getByRole("link", { name: "Jobs", exact: true }).click();
  await expect(page.getByRole("link", { name: /UI Engineer/ })).toBeVisible();
});

test("knowledge-base upload, open, metadata, and delete", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Knowledge Base", exact: true }).click();
  await page.getByLabel("Add a document").setInputFiles({
    name: "synthetic-resume.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic test document. No personal data."),
  });
  await page.getByRole("button", { name: "Upload file" }).click();
  await expect(page.getByText("File uploaded.")).toBeVisible();
  await expect(page.getByText("synthetic-resume.txt")).toBeVisible();
  const openLink = page.getByRole("link", { name: "Open" });
  await expect(openLink).toHaveAttribute("href", /\/knowledge-base\/files\/[0-9a-f-]{36}/);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("File deleted.")).toBeVisible();
  await expect(page.getByText("No files uploaded")).toBeVisible();
});

test("major screens render cleanly at desktop and narrow widths", async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("login-desktop.png"), fullPage: true });
  await signIn(page);

  await page.goto("/jobs/new");
  await page.getByLabel("Job title").fill("Visual QA Engineer");
  await page.getByLabel("Company").fill("Synthetic Visual Co");
  await page.getByRole("button", { name: "Create job" }).click();
  await expect(page.getByRole("heading", { name: "Visual QA Engineer" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("job-detail-desktop.png"), fullPage: true });

  const screens = [
    ["dashboard", "/dashboard", "Dashboard"],
    ["jobs", "/jobs", "Jobs"],
    ["board", "/board", "Board"],
    ["filters", "/filters", "Filters"],
    ["knowledge-base", "/knowledge-base", "Knowledge Base"],
    ["import", "/import", "Import from Google Sheets"],
    ["account", "/account", "Account"],
  ] as const;

  for (const [slug, path, heading] of screens) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${slug}-desktop.png`), fullPage: true });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  for (const [slug, path, heading] of screens) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    const layout = await page.evaluate(() => ({
      documentScroll: (() => {
        window.scrollTo({ left: 100_000, top: 0 });
        const position = window.scrollX;
        window.scrollTo({ left: 0, top: 0 });
        return position;
      })(),
      offenders: Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .filter((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
        .slice(0, 5)
        .map((element) => `${element.tagName.toLowerCase()}.${element.className}:${Math.round(element.getBoundingClientRect().right)}`),
    }));
    expect(layout.documentScroll, `${path} should not overflow the narrow viewport (${layout.offenders.join(", ")})`).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`${slug}-narrow.png`), fullPage: true });
  }

  expect(consoleErrors, "major screens should not emit browser console errors").toEqual([]);
});
