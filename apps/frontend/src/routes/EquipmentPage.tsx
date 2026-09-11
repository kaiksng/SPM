import { PagePlaceholder } from "@/features/workspace/components/page-placeholder";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

export function EquipmentPage() {
  usePageTitle("Equipment");

  return (
    <RoleGate>
      <PagePlaceholder
        title="Equipment"
        description="Reserve and track technical equipment here."
      />
    </RoleGate>
  );
}
