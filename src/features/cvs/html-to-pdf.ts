import "server-only";

import { chromium } from "@playwright/test";

export async function renderHtmlToPdf(html: string): Promise<Uint8Array> {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH?.trim() || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
    await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return new Uint8Array(pdf);
  } finally {
    await browser.close();
  }
}
