import { getRoleDestination } from "@spm/shared";
import { Navigate, Outlet } from "react-router";

import { useAuth } from "@/context/auth-context";

export function AuthLayout() {
  const { user, profile, loading } = useAuth();

  if (loading) return null;
  if (user && profile) {
    return <Navigate to={getRoleDestination(profile.role)} replace />;
  }

  return (
    <div className="bg-background min-h-screen">
      <Outlet />
    </div>
  );
}
