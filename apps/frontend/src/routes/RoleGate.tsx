import { isPathAllowedForRole } from "@spm/shared";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

import { useAuth } from "@/context/auth-context";

/** Redirects to /home if the signed-in user's role isn't entitled to this route. */
export function RoleGate({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const location = useLocation();

  if (!profile) return null;
  if (!isPathAllowedForRole(location.pathname, profile.role)) {
    return <Navigate to="/home" replace />;
  }

  return children;
}
