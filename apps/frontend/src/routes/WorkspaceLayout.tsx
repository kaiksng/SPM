import { Outlet } from "react-router";

import { useAuth } from "@/context/auth-context";
import { WorkspaceShell } from "@/features/workspace/components/workspace-shell";

export function WorkspaceLayout() {
  const { user, profile } = useAuth();

  if (!user || !profile) return null;

  return (
    <WorkspaceShell
      role={profile.role}
      email={user.email ?? ""}
      fullName={profile.full_name}
    >
      <Outlet />
    </WorkspaceShell>
  );
}
