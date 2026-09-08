import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentProfile } from "@/features/auth/queries/get-current-profile";
import { PagePlaceholder } from "@/features/workspace/components/page-placeholder";
import { isPathAllowedForRole } from "@/features/workspace/domain/navigation";
import { requireUserForPage } from "@/server/auth/require-user-for-page";

export const metadata: Metadata = {
  title: "Equipment",
};

export default async function EquipmentPage() {
  const user = await requireUserForPage();
  const profile = await getCurrentProfile(user.id);

  if (!isPathAllowedForRole("/equipment", profile.role)) {
    redirect("/home");
  }

  return (
    <PagePlaceholder
      title="Equipment"
      description="Reserve and track technical equipment here."
    />
  );
}
