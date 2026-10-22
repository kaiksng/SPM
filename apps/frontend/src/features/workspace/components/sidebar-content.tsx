import { getNavItemsForRole, type UserRole } from "@spm/shared";

import { NavLinks } from "@/features/workspace/components/nav-links";

export function SidebarContent({
  role,
  onNavigate,
}: {
  role: UserRole;
  onNavigate?: () => void;
}) {
  const items = getNavItemsForRole(role);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
      <NavLinks items={items} onNavigate={onNavigate} />
    </div>
  );
}
