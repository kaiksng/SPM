import { getRoleDestination, type UserRole } from "@spm/shared";
import { X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router";

import { SidebarContent } from "@/features/workspace/components/sidebar-content";
import { Topbar } from "@/features/workspace/components/topbar";
import { Button } from "@/components/ui/button";

export function WorkspaceShell({
  role,
  email,
  fullName,
  children,
}: {
  role: UserRole;
  email: string;
  fullName: string | null;
  children: ReactNode;
}) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // Close the drawer on Escape and stop background scroll while it's open.
  useEffect(() => {
    if (!isMobileNavOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMobileNavOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [isMobileNavOpen]);

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <Topbar
        role={role}
        email={email}
        fullName={fullName}
        isMobileNavOpen={isMobileNavOpen}
        onOpenMobileNav={() => setIsMobileNavOpen(true)}
      />

      <div className="flex min-h-0 flex-1">
        {isMobileNavOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              type="button"
              aria-hidden="true"
              tabIndex={-1}
              className="absolute inset-0 bg-black/40"
              onClick={() => setIsMobileNavOpen(false)}
            />
            <div className="bg-background relative z-50 flex h-full w-72 max-w-[85vw] flex-col shadow-xl">
              <div className="border-border flex h-14 shrink-0 items-center gap-2.5 border-b px-4">
                <Link
                  to={getRoleDestination(role)}
                  onClick={() => setIsMobileNavOpen(false)}
                  className="flex min-w-0 flex-1 items-center gap-2.5"
                >
                  <span className="bg-primary text-primary-foreground grid size-8 shrink-0 place-items-center rounded-lg text-sm font-bold">
                    CS
                  </span>
                  <span className="truncate text-sm font-semibold tracking-tight">
                    ConnectSphere
                  </span>
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Close menu"
                  onClick={() => setIsMobileNavOpen(false)}
                >
                  <X />
                </Button>
              </div>
              <SidebarContent
                role={role}
                onNavigate={() => setIsMobileNavOpen(false)}
              />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </div>
  );
}
