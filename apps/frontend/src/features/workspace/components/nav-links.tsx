import type { NavItem } from "@spm/shared";
import { Link, useLocation } from "react-router";

import { NavIcon } from "@/features/workspace/components/nav-icon";
import { cn } from "@/lib/utils";

export function NavLinks({
  items,
  onNavigate,
  orientation = "vertical",
}: {
  items: NavItem[];
  onNavigate?: () => void;
  /** "horizontal" for the desktop top nav bar; "vertical" for the mobile drawer. */
  orientation?: "horizontal" | "vertical";
}) {
  const location = useLocation();

  return (
    <nav
      className={cn(
        "flex gap-1",
        orientation === "horizontal" ? "flex-row items-center" : "flex-col",
      )}
    >
      {items.map((item) => {
        const isActive = location.pathname === item.href;

        return (
          <Link
            key={item.id}
            to={item.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-lg text-sm font-medium transition-colors",
              orientation === "horizontal" ? "px-3 py-1.5" : "px-3 py-2",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-foreground/70 hover:bg-primary/5 hover:text-foreground",
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
