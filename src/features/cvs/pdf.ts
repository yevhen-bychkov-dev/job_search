import type { CvRenderInput } from "./types";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);
const BODY_SIZE = 9.5;
const BODY_LEADING = 13;

type Page = { operations: string[]; y: number };

function ascii(value: string): string {
  return value
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .replace(/ß/g, "ss")
    .replace(/æ/g, "ae")
    .replace(/Æ/g, "AE")
    .replace(/ø/g, "o")
    .replace(/Ø/g, "O")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pdfText(value: string): string {
  return ascii(value).replace(/([\\()])/g, "\\$1");
}

function estimatedWidth(value: string, size: number): number {
  return [...ascii(value)].reduce((width, character) => {
    if (character === " ") return width + (size * 0.28);
    if (/[A-Z0-9]/.test(character)) return width + (size * 0.58);
    return width + (size * 0.49);
  }, 0);
}

function wrap(value: string, size: number, width: number): string[] {
  const words = ascii(value).split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (estimatedWidth(next, size) <= width) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    if (estimatedWidth(word, size) <= width) {
      line = word;
      continue;
    }
    let fragment = "";
    for (const character of word) {
      if (estimatedWidth(fragment + character, size) > width && fragment) {
        lines.push(fragment);
        fragment = character;
      } else {
        fragment += character;
      }
    }
    line = fragment;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function drawText(page: Page, value: string, x: number, y: number, size: number, bold = false, color = "0.18 0.22 0.30"): void {
  page.operations.push(`BT /${bold ? "F2" : "F1"} ${size.toFixed(2)} Tf ${color} rg 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${pdfText(value)}) Tj ET`);
}

function drawLine(page: Page, y: number): void {
  page.operations.push(`q 0.82 0.85 0.90 RG 0.7 w ${MARGIN} ${y.toFixed(2)} m ${(PAGE_WIDTH - MARGIN).toFixed(2)} ${y.toFixed(2)} l S Q`);
}

function dateRange(start: string | null, end: string | null): string {
  if (!start && !end) return "";
  return `${start ?? ""} - ${end ?? "Present"}`;
}

export function renderCvPdf(input: CvRenderInput): Uint8Array {
  const pages: Page[] = [];
  const newPage = () => {
    const page = { operations: [], y: PAGE_HEIGHT - MARGIN };
    pages.push(page);
    return page;
  };
  let page = newPage();
  const ensure = (height: number) => {
    if (page.y - height < MARGIN + 24) page = newPage();
  };
  const gap = (height: number) => { page.y -= height; };
  const paragraph = (value: string, options: { size?: number; leading?: number; indent?: number; prefix?: string; continuationHeading?: string; bold?: boolean } = {}) => {
    const size = options.size ?? BODY_SIZE;
    const leading = options.leading ?? BODY_LEADING;
    const indent = options.indent ?? 0;
    const prefix = options.prefix ?? "";
    const lines = wrap(`${prefix}${value}`, size, CONTENT_WIDTH - indent);
    const paragraphHeight = lines.length * leading;
    const freshPageCapacity = PAGE_HEIGHT - (MARGIN * 2) - 24;
    if (paragraphHeight <= freshPageCapacity) {
      const previousPage = page;
      ensure(paragraphHeight);
      if (page !== previousPage && options.continuationHeading) {
        drawText(page, `${options.continuationHeading} (continued)`, MARGIN, page.y, 10, true);
        page.y -= 18;
      }
    }
    for (const line of lines) {
      const previousPage = page;
      ensure(leading);
      if (page !== previousPage && options.continuationHeading) {
        drawText(page, `${options.continuationHeading} (continued)`, MARGIN, page.y, 10, true);
        page.y -= 18;
      }
      drawText(page, line, MARGIN + indent, page.y, size, options.bold);
      page.y -= leading;
    }
  };
  const section = (title: string) => {
    ensure(34 + BODY_LEADING);
    gap(10);
    drawText(page, title.toUpperCase(), MARGIN, page.y, 10, true, "0.10 0.25 0.52");
    page.y -= 8;
    drawLine(page, page.y);
    page.y -= 14;
  };

  for (const line of wrap(input.personal.name, 21, CONTENT_WIDTH)) {
    ensure(24);
    drawText(page, line, MARGIN, page.y, 21, true, "0.08 0.12 0.20");
    page.y -= 24;
  }
  if (input.content.headline) {
    for (const line of wrap(input.content.headline, 11.5, CONTENT_WIDTH)) {
      ensure(15);
      drawText(page, line, MARGIN, page.y, 11.5, false, "0.19 0.34 0.62");
      page.y -= 15;
    }
    gap(3);
  }
  const contact = [
    input.personal.location,
    input.personal.email,
    input.personal.phone,
    ...Object.entries(input.personal.links).map(([label, url]) => `${label}: ${url}`),
  ].filter((value): value is string => Boolean(value));
  if (contact.length) {
    for (const line of wrap(contact.join(" | "), 8.5, CONTENT_WIDTH)) {
      ensure(11);
      drawText(page, line, MARGIN, page.y, 8.5, false, "0.35 0.39 0.46");
      page.y -= 11;
    }
  }
  gap(2);
  drawLine(page, page.y);
  page.y -= 4;

  if (input.content.summary) {
    section("Professional Summary");
    paragraph(input.content.summary, { continuationHeading: "Professional Summary" });
  }
  if (input.content.skills.length) {
    section("Skills");
    paragraph(input.content.skills.join(" | "), { continuationHeading: "Skills" });
  }
  section("Experience");
  for (const experience of input.content.experience) {
    ensure(54);
    paragraph(`${experience.role} - ${experience.company}`, { size: 10.5, leading: 13, bold: true });
    const range = dateRange(experience.startDate, experience.endDate);
    if (range) {
      ensure(12);
      drawText(page, range, MARGIN, page.y, 8.5, false, "0.42 0.45 0.52");
      page.y -= 12;
    }
    if (experience.technologies.length) {
      paragraph(`Technologies: ${experience.technologies.join(", ")}`, { size: 8.7, leading: 11, continuationHeading: `${experience.role} - ${experience.company}` });
    }
    for (const achievement of experience.achievements) {
      paragraph(achievement, { indent: 10, prefix: "- ", continuationHeading: `${experience.role} - ${experience.company}` });
    }
    gap(7);
  }
  if (input.content.education.length) {
    section("Education");
    for (const education of input.content.education) {
      ensure(36);
      paragraph(education.degree ? `${education.degree} - ${education.institution}` : education.institution, { size: 10, leading: 13, bold: true });
      const range = dateRange(education.startDate, education.endDate);
      if (range) {
        ensure(12);
        drawText(page, range, MARGIN, page.y, 8.5, false, "0.42 0.45 0.52");
        page.y -= 12;
      }
      gap(5);
    }
  }

  pages.forEach((renderedPage, index) => {
    drawText(renderedPage, `Page ${index + 1} of ${pages.length}`, PAGE_WIDTH - MARGIN - 52, 26, 7.5, false, "0.48 0.51 0.57");
  });

  const objects: string[] = [];
  const pageReferences = pages.map((_, index) => `${5 + (index * 2)} 0 R`).join(" ");
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${pageReferences}] /Count ${pages.length} >>`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  for (let index = 0; index < pages.length; index += 1) {
    const contentObject = 6 + (index * 2);
    const stream = `${pages[index].operations.join("\n")}\n`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObject} 0 R >>`);
    objects.push(`<< /Length ${new TextEncoder().encode(stream).byteLength} >>\nstream\n${stream}endstream`);
  }
  let pdf = "%PDF-1.4\n% Job Search OS\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(new TextEncoder().encode(pdf).byteLength);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = new TextEncoder().encode(pdf).byteLength;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
