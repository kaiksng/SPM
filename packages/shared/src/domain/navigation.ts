import type { UserRole } from "../types/role";

export type NavItemId =
  "dashboard" | "events" | "venues" | "equipment" | "browse-events";

export interface NavItem {
  id: NavItemId;
  label: string;
  href: string;
}

const NAV_ITEMS: Record<NavItemId, NavItem> = {
  dashboard: { id: "dashboard", label: "Dashboard", href: "/home" },
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
  event_organiser: ["dashboard", "events"],
  event_coordinator: ["dashboard", "events", "venues", "equipment"],
  venue_staff: ["dashboard", "venues"],
  technical_support_staff: ["dashboard", "equipment"],
  attendee: ["browse-events"],
  administrator: ["dashboard", "events", "venues", "equipment"],
} as const satisfies Record<UserRole, readonly NavItemId[]>;

/** Ordered nav items a given role sees in the workspace side menu. */
export function getNavItemsForRole(role: UserRole): NavItem[] {
  return ROLE_NAV_ITEM_IDS[role].map((id) => NAV_ITEMS[id]);
}

/** Whether a role is entitled to a nav section, keyed by its route path. */
export function isPathAllowedForRole(pathname: string, role: UserRole) {
  return getNavItemsForRole(role).some((item) => item.href === pathname);
}
