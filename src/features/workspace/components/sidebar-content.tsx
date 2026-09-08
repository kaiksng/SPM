import type { UserRole } from "@/features/auth/types/role";
import { NavLinks } from "@/features/workspace/components/nav-links";
import { getNavItemsForRole } from "@/features/workspace/domain/navigation";

export function SidebarContent({
  role,
  onNavigate,
}: {
  role: UserRole;
  onNavigate?: () => void;
}) {
  const items = getNavItemsForRole(role);

  return (
    <div className="h-full overflow-y-auto px-3 py-4">
      <NavLinks items={items} onNavigate={onNavigate} />
    </div>
  );
}
