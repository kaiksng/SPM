import { PagePlaceholder } from "@/features/workspace/components/page-placeholder";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

export function VenuesPage() {
  usePageTitle("Venues");

  return (
    <RoleGate>
      <PagePlaceholder
        title="Venues"
        description="Manage venue availability and bookings here."
      />
    </RoleGate>
  );
}
