import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { requireIdentity } from "@/features/auth/session";
import { updateJobAction } from "@/features/jobs/actions";
import { JobForm } from "@/features/jobs/job-form";
import { getAppStore } from "@/lib/data/server-store";
import { isUuid } from "@/lib/validation";

export const metadata: Metadata = { title: "Edit job" };

export default async function EditJobPage({ params }: PageProps<"/jobs/[id]/edit">) {
  const identity = await requireIdentity();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const job = await getAppStore().getJob(identity.userId, id);
  if (!job) notFound();
  const action = updateJobAction.bind(null, id);
  return <div className="page-stack page-narrow"><Link className="back-link" href={`/jobs/${id}`}>← Back to job</Link><PageHeader eyebrow="Job details" title={`Edit ${job.title}`} description={`Update the information saved for ${job.company}.`} /><JobForm action={action} job={job} submitLabel="Save changes" /></div>;
}
