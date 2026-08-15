import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import { requireIdentity } from "@/features/auth/session";
import { FiltersForm } from "@/features/filters/filters-form";
import { getAppStore } from "@/lib/data/server-store";

export const metadata: Metadata = { title: "Filters" };

export default async function FiltersPage() {
  const identity = await requireIdentity();
  const filters = await getAppStore().getFilters(identity.userId);
  return <div className="page-stack page-narrow"><PageHeader eyebrow="Source preferences" title="Filters" description="Define what future vacancy sources should include or exclude. No automated source checking runs in this MVP." /><div className="info-banner"><strong>Future-ready, currently manual.</strong><span>These settings are stored now and exposed through the normalized ingestion boundary for future connectors.</span></div><FiltersForm filters={filters} /></div>;
}
