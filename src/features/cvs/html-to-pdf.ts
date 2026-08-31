import "server-only";

import serverlessChromium from "@sparticuz/chromium";
import { chromium, type Browser, type Page } from "playwright-core";

export type PdfRenderErrorCode = "PDF_BROWSER_LAUNCH_FAILED" | "PDF_PAGE_CREATE_FAILED" | "PDF_HTML_LOAD_FAILED" | "PDF_CREATION_FAILED" | "PDF_OUTPUT_INVALID";

export class PdfRenderError extends Error {
  readonly code: PdfRenderErrorCode;

  constructor(code: PdfRenderErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PdfRenderError";
    this.code = code;
  }
}

export async function renderHtmlToPdf(html: string): Promise<Uint8Array> {
  const explicitPath = process.env.CHROMIUM_PATH?.trim();
  const useServerlessChromium = process.env.VERCEL === "1" && !explicitPath;
  let browser: Browser;
  try {
    const executablePath = explicitPath
      || (useServerlessChromium ? await serverlessChromium.executablePath() : undefined);
    browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: useServerlessChromium
        ? serverlessChromium.args
        : ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
  } catch (error) {
    throw new PdfRenderError("PDF_BROWSER_LAUNCH_FAILED", "The PDF browser could not start.", { cause: error });
  }
  try {
    let page: Page;
    try {
      page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
    } catch (error) {
      throw new PdfRenderError("PDF_PAGE_CREATE_FAILED", "Chromium could not create a page for PDF rendering.", { cause: error });
    }
    await page.route("**/*", async (route) => {
      const url = route.request().url();
      if (url === "about:blank" || url.startsWith("data:")) await route.continue();
      else await route.abort("blockedbyclient");
    });
    try {
      await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 10_000 });
      await page.emulateMedia({ media: "print" });
    } catch (error) {
      throw new PdfRenderError("PDF_HTML_LOAD_FAILED", "The validated resume template could not be loaded for printing.", { cause: error });
    }
    let pdf: Buffer;
    try {
      pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      });
    } catch (error) {
      throw new PdfRenderError("PDF_CREATION_FAILED", "Chromium could not create the resume PDF.", { cause: error });
    }
    const bytes = new Uint8Array(pdf);
    if (bytes.byteLength < 1_000 || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
      throw new PdfRenderError("PDF_OUTPUT_INVALID", "The PDF renderer returned an invalid document.");
    }
    return bytes;
  } finally {
    await browser.close().catch(() => undefined);
  }
}
