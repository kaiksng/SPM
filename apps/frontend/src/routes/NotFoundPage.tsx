import { MapPinOff } from "lucide-react";
import { Link } from "react-router";

import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";

/** Catch-all for any URL that doesn't match a route, signed in or not. */
export function NotFoundPage() {
  const { user } = useAuth();

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-6 text-center">
      <div className="flex flex-col items-center">
        <span className="grid size-12 place-items-center rounded-full bg-slate-200 text-slate-600">
          <MapPinOff aria-hidden="true" className="size-6" />
        </span>
        <h1 className="mt-4 text-2xl font-semibold text-slate-950">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          The page you&apos;re looking for doesn&apos;t exist or has been
          moved.
        </p>
        <Link
          to={user ? "/home" : "/"}
          className={buttonVariants({ variant: "default", className: "mt-6" })}
        >
          Go to home
        </Link>
      </div>
    </div>
  );
}
