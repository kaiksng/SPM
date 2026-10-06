import { PagePlaceholder } from "@/features/workspace/components/page-placeholder";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

export function SafetyChecksPage() {
  usePageTitle("Safety Checks");

  return (
    <RoleGate>
      <PagePlaceholder
        title="Safety Checks"
        description="Operational safety reviews for confirmed events will appear here."
      />
    </RoleGate>
  );
}
