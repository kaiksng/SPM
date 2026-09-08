import type { Metadata } from "next";

import { PagePlaceholder } from "@/features/workspace/components/page-placeholder";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function WorkspaceHomePage() {
  return (
    <PagePlaceholder
      title="Dashboard"
      description="An overview of what needs your attention will live here."
    />
  );
}
