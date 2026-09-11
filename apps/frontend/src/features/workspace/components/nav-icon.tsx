import type { NavItemId } from "@spm/shared";
import {
  Building2,
  CalendarDays,
  Compass,
  LayoutDashboard,
  Wrench,
} from "lucide-react";

const NAV_ICONS = {
  dashboard: LayoutDashboard,
  events: CalendarDays,
  venues: Building2,
  equipment: Wrench,
  "browse-events": Compass,
} as const satisfies Record<
  NavItemId,
  React.ComponentType<{ className?: string }>
>;

export function NavIcon({
  id,
  className,
}: {
  id: NavItemId;
  className?: string;
}) {
  const Icon = NAV_ICONS[id];
  return <Icon className={className} aria-hidden="true" />;
}
