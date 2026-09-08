import type { ReactNode } from "react";

import { getCurrentProfile } from "@/features/auth/queries/get-current-profile";
import { WorkspaceShell } from "@/features/workspace/components/workspace-shell";
import { requireUserForPage } from "@/server/auth/require-user-for-page";

export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUserForPage();
  const profile = await getCurrentProfile(user.id);

  return (
    <WorkspaceShell
      role={profile.role}
      email={user.email ?? ""}
      fullName={profile.full_name}
    >
      {children}
    </WorkspaceShell>
  );
}
