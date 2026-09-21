import type { UserRole } from "@spm/shared";
import { X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

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
              <SidebarContent
                role={role}
                onNavigate={() => setIsMobileNavOpen(false)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close menu"
                onClick={() => setIsMobileNavOpen(false)}
                className="text-foreground absolute top-2.5 right-2.5"
              >
                <X />
              </Button>
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
