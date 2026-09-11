import { Navigate, Outlet } from "react-router";

import { useAuth } from "@/context/auth-context";

/** Route guard for the workspace layout: redirects to sign-in instead of throwing. */
export function RequireSession() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  return <Outlet />;
}
