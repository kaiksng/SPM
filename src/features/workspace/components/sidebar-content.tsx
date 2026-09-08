import { getRoleLabel } from "@/features/auth/domain/role-label";
import type { UserRole } from "@/features/auth/types/role";
import { NavLinks } from "@/features/workspace/components/nav-links";
import { SignOutButton } from "@/features/workspace/components/sign-out-button";
import { getNavItemsForRole } from "@/features/workspace/domain/navigation";

export function SidebarContent({
  role,
  email,
  onNavigate,
}: {
  role: UserRole;
  email: string;
  onNavigate?: () => void;
}) {
  const items = getNavItemsForRole(role);

  return (
    <div className="flex h-full flex-col">
      <div className="border-sidebar-border flex h-14 items-center gap-2.5 border-b px-4">
        <span className="bg-sidebar-primary text-sidebar-primary-foreground grid size-8 shrink-0 place-items-center rounded-lg text-sm font-bold">
          CS
        </span>
        <span className="text-sidebar-foreground text-sm font-semibold tracking-tight">
          ConnectSphere
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <NavLinks items={items} onNavigate={onNavigate} />
      </div>

      <div className="border-sidebar-border border-t p-3">
        <p className="text-sidebar-foreground/60 truncate px-1 text-xs font-medium tracking-wide uppercase">
          {getRoleLabel(role)}
        </p>
        <p className="text-sidebar-foreground mt-0.5 truncate px-1 text-sm">
          {email}
        </p>
        <div className="mt-3">
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
