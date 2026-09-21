import { getNavItemsForRole, getRoleDestination, type UserRole } from "@spm/shared";
import { Menu as MenuIcon } from "lucide-react";
import { Link } from "react-router";

import { NavLinks } from "@/features/workspace/components/nav-links";
import { UserMenu } from "@/features/workspace/components/user-menu";
import { Button } from "@/components/ui/button";

/**
 * A single horizontal bar: logo, nav links, and the user menu, in that
 * order — nav links render inline here on desktop instead of in a left
 * sidebar. On mobile the links move into WorkspaceShell's drawer instead,
 * opened by the hamburger button.
 */
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
  const items = getNavItemsForRole(role);

  return (
    <header className="border-border bg-background sticky top-0 z-30 flex h-14 shrink-0 items-center gap-4 border-b px-4">
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

      <Link
        to={getRoleDestination(role)}
        className="flex shrink-0 items-center gap-2.5"
      >
        <span className="bg-primary text-primary-foreground grid size-8 shrink-0 place-items-center rounded-lg text-sm font-bold">
          CS
        </span>
        <span className="hidden text-sm font-semibold tracking-tight sm:inline">
          ConnectSphere
        </span>
      </Link>

      <div className="hidden lg:block">
        <NavLinks items={items} orientation="horizontal" />
      </div>

      <div className="ml-auto">
        <UserMenu role={role} email={email} fullName={fullName} />
      </div>
    </header>
  );
}
