import { getRoleDestination, isPathAllowedForRole } from "@spm/shared";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";

import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";

/** Shows an access-denied message if the signed-in user's role isn't entitled to this route. */
export function RoleGate({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const location = useLocation();

  if (!profile) return null;
  if (!isPathAllowedForRole(location.pathname, profile.role)) {
    return (
      <div className="grid h-full place-items-center bg-slate-50 px-6 text-center">
        <div className="flex flex-col items-center">
          <span className="grid size-12 place-items-center rounded-full bg-red-100 text-red-700">
            <Lock aria-hidden="true" className="size-6" />
          </span>
          <p className="mt-4 text-sm font-semibold text-red-700">
            Access denied
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-950">
            You don&apos;t have access to this page
          </h1>
          <Link
            to={getRoleDestination(profile.role)}
            className={buttonVariants({
              variant: "default",
              className: "mt-6",
            })}
          >
            Return to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return children;
}
