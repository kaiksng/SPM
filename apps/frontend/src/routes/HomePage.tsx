import { PagePlaceholder } from "@/features/workspace/components/page-placeholder";
import { usePageTitle } from "@/hooks/use-page-title";

export function HomePage() {
  usePageTitle("Dashboard");

  return (
    <PagePlaceholder
      title="Dashboard"
      description="An overview of what needs your attention will live here."
    />
  );
}
