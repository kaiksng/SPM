import { Menu as MenuIcon } from "lucide-react";
import Link from "next/link";

import type { UserRole } from "@/features/auth/types/role";
import { UserMenu } from "@/features/workspace/components/user-menu";
import { Button } from "@/components/ui/button";

export function Topbar({
  role,
  email,
  fullName,
  isMobileNavOpen,
  onOpenMobileNav,
}: {
  role: UserRole;
  email: string;
  fullName: string | null;
  isMobileNavOpen: boolean;
  onOpenMobileNav: () => void;
}) {
  return (
    <header className="border-border bg-background sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b px-4">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Open menu"
        aria-expanded={isMobileNavOpen}
        onClick={onOpenMobileNav}
        className="lg:hidden"
      >
        <MenuIcon />
      </Button>

      <Link href="/home" className="flex items-center gap-2.5">
        <span className="bg-primary text-primary-foreground grid size-8 shrink-0 place-items-center rounded-lg text-sm font-bold">
          CS
        </span>
        <span className="text-sm font-semibold tracking-tight">
          ConnectSphere
        </span>
      </Link>

      <div className="ml-auto">
        <UserMenu role={role} email={email} fullName={fullName} />
      </div>
    </header>
  );
}
