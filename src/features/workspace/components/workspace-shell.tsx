"use client";

import { Menu, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import type { UserRole } from "@/features/auth/types/role";
import { SidebarContent } from "@/features/workspace/components/sidebar-content";
import { Button } from "@/components/ui/button";

export function WorkspaceShell({
  role,
  email,
  children,
}: {
  role: UserRole;
  email: string;
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
    <div className="bg-background flex min-h-screen">
      <aside className="border-sidebar-border bg-sidebar hidden w-64 shrink-0 border-r lg:block">
        <div className="fixed h-screen w-64">
          <SidebarContent role={role} email={email} />
        </div>
      </aside>

      {isMobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsMobileNavOpen(false)}
          />
          <div className="bg-sidebar relative z-50 flex h-full w-72 max-w-[85vw] flex-col shadow-xl">
            <SidebarContent
              role={role}
              email={email}
              onNavigate={() => setIsMobileNavOpen(false)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close menu"
              onClick={() => setIsMobileNavOpen(false)}
              className="text-sidebar-foreground absolute top-2.5 right-2.5"
            >
              <X />
            </Button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border bg-background sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b px-4 lg:hidden">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Open menu"
            aria-expanded={isMobileNavOpen}
            onClick={() => setIsMobileNavOpen(true)}
          >
            <Menu />
          </Button>
          <span className="text-sm font-semibold tracking-tight">
            ConnectSphere
          </span>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
