import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { createJobAction } from "@/features/jobs/actions";
import { dateInTimeZone } from "@/features/jobs/domain";
import { JobForm } from "@/features/jobs/job-form";

export const metadata: Metadata = { title: "Add job" };

export default function NewJobPage() {
  return <div className="page-stack page-narrow"><Link className="back-link" href="/jobs">← Back to jobs</Link><PageHeader eyebrow="New opportunity" title="Add a job" description="Capture the essentials now; you can refine details later." /><JobForm action={createJobAction} submitLabel="Create job" defaultDiscoveredOn={dateInTimeZone()} /></div>;
}
