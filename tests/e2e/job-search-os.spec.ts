import { expect, test, type Page } from "@playwright/test";

const TEST_EMAIL = "demo.user@example.test";
const SECONDARY_TEST_EMAIL = "other.user@example.test";
const TEST_PASSWORD = "DemoPass!123";

async function reset(page: Page) {
  const response = await page.request.post("/api/test/reset");
  expect(response.ok()).toBeTruthy();
}

async function signIn(page: Page, email = TEST_EMAIL) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await reset(page);
});

test("authentication, protected routes, navigation, and logout", async ({ page }) => {
  const loginResponse = await page.request.get("/login");
  expect(loginResponse.headers()["x-content-type-options"]).toBe("nosniff");
  expect(loginResponse.headers()["x-frame-options"]).toBe("DENY");
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
  await page.getByLabel("Date discovered").fill("2026-08-15");
  await page.getByLabel("Date applied").fill("2026-08-14");
  await page.getByLabel("Technologies").fill("React, TypeScript, Next.js");
  await page.getByLabel("Description").fill("Synthetic role used only by deterministic browser tests.");
  await page.getByLabel("Private notes").fill("Synthetic note; contains no personal data.");
  await page.getByRole("button", { name: "Create job" }).click();
  await expect(page.getByText("Applied date cannot be earlier than the discovered date.")).toBeVisible();
  await expect(page.getByText("Check the highlighted fields.")).toBeFocused();
  await page.getByLabel("Date applied").fill("2026-08-15");
  await page.getByRole("button", { name: "Create job" }).click();

  await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]{36}\?created=1$/);
  await expect(page.getByRole("heading", { name: "Frontend Engineer" })).toBeVisible();
  await expect(page.getByText("Job created.")).toBeVisible();
  await expect(page.getByText("Synthetic role used only")).toBeVisible();
  await expect(page.getByText(/Add a validated Candidate Profile JSON/)).toBeVisible();

  await page.getByRole("link", { name: "Edit job" }).click();
  const stalePage = await page.context().newPage();
  await stalePage.goto(page.url());
  await expect(stalePage.getByRole("heading", { name: "Edit Frontend Engineer" })).toBeVisible();
  await page.getByLabel("Job title").fill("Senior Frontend Engineer");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Senior Frontend Engineer" })).toBeVisible();
  await expect(page.getByText("Job updated.")).toBeVisible();
  await stalePage.getByLabel("Job title").fill("Stale Frontend Engineer");
  await stalePage.getByRole("button", { name: "Save changes" }).click();
  await expect(stalePage.getByText("This job changed in another tab. Reload the page before saving again.")).toBeVisible();
  await expect(stalePage.getByText("This job changed in another tab. Reload the page before saving again.")).toBeFocused();
  await stalePage.close();

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
  await page.getByLabel("Excluded technologies").fill("React");
  await page.getByRole("button", { name: "Save filters" }).click();
  await expect(page.getByText("React cannot be both included and excluded.")).toBeVisible();
  await expect(page.getByText("Check the highlighted fields.")).toBeFocused();
  await expect(page.getByLabel("Preferred job titles")).toHaveValue("Frontend\nUI Engineer");
  await page.getByLabel("Excluded technologies").fill("PHP");
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

test("discover, inspect, bulk add, and permanently hide external jobs", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Discover", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Discover jobs" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "JustJoinIT" })).toHaveAttribute("aria-selected", "true");

  await page.getByLabel("Keywords or technologies").fill("React");
  await expect(page.getByRole("heading", { name: "Search current vacancies" })).toBeVisible();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Search results" })).toBeVisible();
  await expect(page.getByText("Frontend Platform Engineer", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Frontend Platform Engineer", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Synthetic vacancy used only by isolated end-to-end tests.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.getByRole("button", { name: "Frontend Platform Engineer", exact: true }).click();
  await page.locator(".discovery-drawer-overlay").click({ position: { x: 10, y: 10 } });
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.getByLabel("Select all displayed jobs").check();
  await page.getByRole("button", { name: "Add selected (2)" }).click();
  await expect(page.getByText("Added 2 jobs.")).toBeVisible();
  await expect(page.getByText("No new jobs found")).toBeVisible();

  await page.getByRole("link", { name: "Jobs", exact: true }).click();
  await expect(page.getByRole("link", { name: /Frontend Platform Engineer/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /UI Engineer/ })).toBeVisible();
  await page.getByRole("link", { name: /Frontend Platform Engineer/ }).click();
  await page.getByRole("link", { name: "Edit job" }).click();
  await page.getByLabel("Private notes").fill("Synthetic discovery edit.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Job updated.")).toBeVisible();
  await page.getByRole("link", { name: "Board", exact: true }).click();
  await expect(page.getByRole("link", { name: /Frontend Platform Engineer/ })).toBeVisible();

  await page.getByRole("link", { name: "Discover", exact: true }).click();
  await page.getByLabel("Keywords or technologies").fill("React");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("No new jobs found")).toBeVisible();
  await page.getByLabel("Keywords or technologies").fill("");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("button", { name: "Software Engineer", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hide", exact: true }).click();
  await expect(page.getByText("Vacancy hidden. It will not appear in future searches.")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("No new jobs found")).toBeVisible();
});

test("NoFluffJobs keeps independent filters, results, selection, and import state", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Discover", exact: true }).click();

  await page.getByLabel("Keywords or technologies").fill("Software");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("button", { name: "Software Engineer", exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "NoFluffJobs" }).click();
  await expect(page.getByRole("tab", { name: "NoFluffJobs" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Category")).toBeVisible();
  await expect(page.getByLabel("Technology")).toBeVisible();
  await expect(page.getByRole("group", { name: "Seniority" })).toBeVisible();
  await page.getByLabel("Keywords or technologies").fill("React");
  await page.getByLabel("Technology").selectOption("react");
  await expect(page.getByRole("heading", { name: "Search current vacancies" })).toBeVisible();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("button", { name: "Senior Frontend Engineer", exact: true })).toBeVisible();
  await page.getByLabel("Select Senior Frontend Engineer at Synthetic No Fluff Studio").check();

  await page.getByRole("tab", { name: "JustJoinIT" }).click();
  await expect(page.getByRole("button", { name: "Software Engineer", exact: true })).toBeVisible();
  await expect(page.getByLabel("Keywords or technologies")).toHaveValue("Software");

  await page.getByRole("tab", { name: "NoFluffJobs" }).click();
  await expect(page.getByRole("button", { name: "Add selected (1)" })).toBeEnabled();
  await expect(page.getByLabel("Keywords or technologies")).toHaveValue("React");
  await expect(page.getByLabel("Technology")).toHaveValue("react");
  await page.getByRole("button", { name: "Add selected (1)" }).click();
  await expect(page.getByText("Added 1 job.")).toBeVisible();
  await expect(page.getByText("No new jobs found")).toBeVisible();

  await page.getByRole("link", { name: "Jobs", exact: true }).click();
  await expect(page.getByRole("link", { name: /Senior Frontend Engineer/ })).toBeVisible();
});

test("knowledge-base upload, open, metadata, and delete", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Knowledge Base", exact: true }).click();
  await page.getByLabel("Add a document").setInputFiles({
    name: "forged.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("This is not a PDF."),
  });
  await page.getByRole("button", { name: "Upload file" }).click();
  await expect(page.getByText("The file contents do not match the selected file type.")).toBeVisible();
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

test("generate immutable CV versions from the verified Candidate Profile", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await page.getByLabel("Import HTML resume template").setInputFiles({
    name: "synthetic-template.html",
    mimeType: "text/html",
    buffer: Buffer.from(`<!doctype html><html><head><style>@page{size:A4;margin:18mm}body{font-family:Arial;color:#182230}h1{margin-bottom:0}.resume-experience-item{break-inside:avoid}</style></head><body><header><h1>{{resume.name}}</h1><p>{{resume.headline}}</p><p>{{resume.location}} · {{resume.email}} · {{resume.phone}}</p><p>{{resume.links}}</p></header><section><h2>Summary</h2><p>{{resume.summary}}</p></section><section><h2>Skills</h2>{{resume.skills}}</section><section><h2>Experience</h2>{{resume.experience}}</section><section><h2>Education</h2>{{resume.education}}</section></body></html>`),
  });
  await page.getByRole("button", { name: "Save template" }).click();
  await expect(page.getByText(/Active template: synthetic-template.html/)).toBeVisible();
  await page.getByRole("link", { name: "Knowledge Base", exact: true }).click();
  await page.getByLabel("Document type").selectOption("candidate_profile");
  const candidateProfile = {
    personal: {
      name: "Synthetic Candidate",
      title: "Frontend Engineer",
      location: "Warsaw, Poland",
      email: "synthetic.candidate@example.test",
      phone: "+48 000 000 000",
      links: { Portfolio: "https://example.test/portfolio" },
    },
    summary: "Frontend engineer building accessible synthetic applications.",
    skills: ["TypeScript", "React", "Accessibility"],
    experience: [{
      id: "synthetic-studio-frontend",
      company: "Synthetic Studio",
      role: "Frontend Engineer",
      startDate: "2023-01",
      endDate: null,
      technologies: ["TypeScript", "React"],
      achievements: [{
        id: "synthetic-accessibility",
        text: "Built accessible synthetic components for deterministic tests.",
        skills: ["Accessibility", "React"],
        categories: ["frontend"],
      }],
    }],
    education: [],
  };
  await page.getByLabel("Add a document").setInputFiles({
    name: "synthetic-candidate-profile.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(candidateProfile)),
  });
  await page.getByRole("button", { name: "Upload file" }).click();
  await expect(page.getByText("File uploaded.")).toBeVisible();
  await expect(page.getByText(/Candidate profile · Current/)).toBeVisible();

  await page.getByRole("link", { name: "Jobs", exact: true }).click();
  await page.getByRole("link", { name: "Add job" }).first().click();
  await page.getByLabel("Job title").fill("Accessible Frontend Engineer");
  await page.getByLabel("Company").fill("Synthetic Hiring Co");
  await page.getByLabel("Technologies").fill("React, TypeScript, GraphQL");
  await page.getByLabel("Description").fill("Build accessible React interfaces with TypeScript.");
  await page.getByRole("button", { name: "Create job" }).click();

  await expect(page.getByRole("heading", { name: "CVs" })).toBeVisible();
  const ownedJobUrl = new URL(page.url()).pathname;
  await expect(page.getByText("No CVs generated for this job yet.")).toBeVisible();
  await page.getByRole("button", { name: "Generate Resume", exact: true }).click();
  await expect(page.getByRole("button", { name: "Analyzing vacancy…" })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Confirm important vacancy requirements" })).toBeVisible();
  await page.locator("fieldset").filter({ hasText: "GraphQL" }).getByLabel("Commercial experience").check();
  await page.getByRole("button", { name: "Confirm and generate resume" }).click();
  await expect(page.getByText("Resume #1 generated.")).toBeVisible();
  for (let version = 2; version <= 5; version += 1) {
    await page.getByRole("button", { name: "Generate Resume", exact: true }).click();
    await expect(page.getByText(`Resume #${version} generated.`)).toBeVisible();
  }
  await expect(page.locator(".cv-list strong")).toHaveText(["CV #5", "CV #4", "CV #3", "CV #2", "CV #1"]);
  await expect(page.getByRole("link", { name: "Preview" })).toHaveCount(5);
  await expect(page.getByRole("link", { name: "Download" })).toHaveCount(5);

  const previewHrefs = await page.getByRole("link", { name: "Preview" }).evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  const downloadHrefs = await page.getByRole("link", { name: "Download" }).evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  for (let index = 0; index < 5; index += 1) {
    const previewHref = previewHrefs[index];
    const downloadHref = downloadHrefs[index];
    if (!previewHref || !downloadHref) throw new Error(`Generated CV #${5 - index} links were not rendered.`);
    const preview = await page.request.get(previewHref);
    expect(preview.ok()).toBeTruthy();
    expect(preview.headers()["content-type"]).toContain("application/pdf");
    expect(preview.headers()["content-disposition"]).toContain("inline");
    const download = await page.request.get(downloadHref);
    expect(download.ok()).toBeTruthy();
    expect(download.headers()["content-disposition"]).toContain(`attachment; filename*=UTF-8''cv-v${5 - index}.pdf`);
  }

  await page.context().clearCookies();
  await signIn(page, SECONDARY_TEST_EMAIL);
  await page.goto(ownedJobUrl);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Accessible Frontend Engineer" })).toHaveCount(0);
  for (const href of [...previewHrefs, ...downloadHrefs]) {
    if (!href) throw new Error("Generated CV link was not rendered.");
    const foreignCv = await page.request.get(href);
    expect(foreignCv.status()).toBe(404);
  }
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
    ["discover", "/jobs/discover", "Discover jobs"],
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
