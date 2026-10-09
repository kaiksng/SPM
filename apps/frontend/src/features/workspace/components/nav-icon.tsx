import type { NavItemId } from "@spm/shared";
import {
  Building2,
  CalendarDays,
  ClipboardCheck,
  Compass,
  Flag,
  ShieldCheck,
  Wrench,
} from "lucide-react";

const NAV_ICONS = {
  events: CalendarDays,
  venues: Building2,
  requests: ClipboardCheck,
  "flagged-bookings": Flag,
  equipment: Wrench,
  "browse-events": Compass,
  "safety-checks": ShieldCheck,
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
