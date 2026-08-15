import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import { ImportForm } from "@/features/import/import-form";

export const metadata: Metadata = { title: "Import" };

export default function ImportPage() {
  return <div className="page-stack"><PageHeader eyebrow="Migration" title="Import from Google Sheets" description="Upload a CSV export, inspect the normalized rows, and import valid jobs without obvious duplicates." /><div className="info-banner"><strong>Expected columns</strong><span>Job title and company are required. Optional columns include status, URL, source, location, work mode, employment type, salary, technologies, notes, and dates.</span></div><ImportForm /></div>;
}
