import { PagePlaceholder } from "@/features/workspace/components/page-placeholder";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

export function BrowseEventsPage() {
  usePageTitle("Browse Event");

  return (
    <RoleGate>
      <PagePlaceholder
        title="Browse Event"
        description="Discover events open for registration here."
      />
    </RoleGate>
  );
}
