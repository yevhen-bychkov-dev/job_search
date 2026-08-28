import { PageHeader } from "@/components/ui/page-header";
import { DiscoveryWorkspace } from "@/features/job-discovery/discovery-workspace";
import { JOB_SOURCES } from "@/lib/job-sources/registry";

export default function DiscoverJobsPage() {
  return (
    <div className="stack page-stack">
      <PageHeader
        eyebrow="External sources"
        title="Discover jobs"
        description="Search current vacancies, review details, and add only the opportunities you want to track."
      />
      <DiscoveryWorkspace sources={JOB_SOURCES} />
    </div>
  );
}
