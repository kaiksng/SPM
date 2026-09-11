import { PagePlaceholder } from "@/features/workspace/components/page-placeholder";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

export function EventsPage() {
  usePageTitle("Events");

  return (
    <RoleGate>
      <PagePlaceholder
        title="Events"
        description="Create, review, and track events here."
      />
    </RoleGate>
  );
}
