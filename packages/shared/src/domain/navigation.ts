import type { UserRole } from "../types/role";

export type NavItemId = "events" | "venues" | "equipment" | "browse-events";

export interface NavItem {
  id: NavItemId;
  label: string;
  href: string;
}

const NAV_ITEMS: Record<NavItemId, NavItem> = {
  events: { id: "events", label: "Events", href: "/events" },
  venues: { id: "venues", label: "Venues", href: "/venues" },
  equipment: { id: "equipment", label: "Equipment", href: "/equipment" },
  "browse-events": {
    id: "browse-events",
    label: "Browse Event",
    href: "/browse-events",
  },
};

const ROLE_NAV_ITEM_IDS = {
  event_organiser: ["events"],
  event_coordinator: ["events", "venues", "equipment"],
  venue_staff: ["venues"],
  technical_support_staff: ["equipment"],
  attendee: ["browse-events"],
  administrator: ["events", "venues", "equipment"],
} as const satisfies Record<UserRole, readonly NavItemId[]>;

/** Ordered nav items a given role sees in the workspace side menu. */
export function getNavItemsForRole(role: UserRole): NavItem[] {
  return ROLE_NAV_ITEM_IDS[role].map((id) => NAV_ITEMS[id]);
}

/** Whether a role is entitled to a nav section, keyed by its route path. */
export function isPathAllowedForRole(pathname: string, role: UserRole) {
  return getNavItemsForRole(role).some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}
