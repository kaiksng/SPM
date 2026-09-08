import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentProfile } from "@/features/auth/queries/get-current-profile";
import { PagePlaceholder } from "@/features/workspace/components/page-placeholder";
import { isPathAllowedForRole } from "@/features/workspace/domain/navigation";
import { requireUserForPage } from "@/server/auth/require-user-for-page";

export const metadata: Metadata = {
  title: "Events",
};

export default async function EventsPage() {
  const user = await requireUserForPage();
  const profile = await getCurrentProfile(user.id);

  if (!isPathAllowedForRole("/events", profile.role)) {
    redirect("/home");
  }

  return (
    <PagePlaceholder
      title="Events"
      description="Create, review, and track events here."
    />
  );
}
