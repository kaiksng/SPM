import type { NavItem } from "@spm/shared";
import { Link, useLocation } from "react-router";

import { NavIcon } from "@/features/workspace/components/nav-icon";
import { cn } from "@/lib/utils";

export function NavLinks({
  items,
  onNavigate,
}: {
  items: NavItem[];
  onNavigate?: () => void;
}) {
  const location = useLocation();

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const isActive = location.pathname === item.href;

        return (
          <Link
            key={item.id}
            to={item.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <NavIcon id={item.id} className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
