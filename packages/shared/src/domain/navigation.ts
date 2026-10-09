import type { UserRole } from "../types/role";

export type NavItemId =
  | "events"
  | "venues"
  | "requests"
  | "flagged-bookings"
  | "equipment"
  | "browse-events"
  | "safety-checks";

export interface NavItem {
  id: NavItemId;
  label: string;
  href: string;
}

const NAV_ITEMS: Record<NavItemId, NavItem> = {
  events: { id: "events", label: "Events", href: "/events" },
  venues: { id: "venues", label: "Venues", href: "/venues" },
  requests: { id: "requests", label: "Requests", href: "/venue-requests" },
  "flagged-bookings": {
    id: "flagged-bookings",
    label: "Flagged",
    href: "/flagged-bookings",
  },
  equipment: { id: "equipment", label: "Equipment", href: "/equipment" },
  "browse-events": {
    id: "browse-events",
    label: "Browse Event",
    href: "/browse-events",
  },
  "safety-checks": {
    id: "safety-checks",
    label: "Safety Checks",
    href: "/safety-checks",
  },
};

const ROLE_NAV_ITEM_IDS = {
  event_organiser: ["events", "venues", "equipment"],
  event_coordinator: ["events", "venues", "equipment"],
  venue_staff: ["venues", "requests", "flagged-bookings"],
  technical_support_staff: ["equipment"],
  attendee: ["browse-events"],
  // View-only for now: the Lead's dashboard is the shared "events" section,
  // just showing every event instead of one organiser's or coordinator's
  // own. See EventsPage's LeadEventsView.
  event_coordinator_lead: ["events"],
  // Access scaffolding only: the Operational Safety Check workflow doesn't
  // exist yet (no "confirmed" status is ever reached today), so this is a
  // placeholder page with no event data until that lands.
  safety_officer: ["safety-checks"],
} as const satisfies Record<UserRole, readonly NavItemId[]>;

/** Ordered nav items a given role sees in the workspace side menu. */
export function getNavItemsForRole(role: UserRole): NavItem[] {
  return ROLE_NAV_ITEM_IDS[role].map((id) => NAV_ITEMS[id]);
}

// A v4 UUID, to tell an event id ("/events/:id") apart from a literal
// route segment like "/events/new" — both match a bare "[^/]+".
const UUID_SEGMENT = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

// The Lead's "events" access is read-only and narrower than an organiser's
// or coordinator's: their dashboard (LeadEventsView) links into the event
// history page and a read-only event detail page, never into venue, edit, or
// creation routes — so, unlike every other role, they get an explicit
// allow-list instead of the whole "/events/*" subtree.
const LEAD_ALLOWED_EVENT_PATHS = [
  /^\/events$/,
  new RegExp(`^/events/${UUID_SEGMENT}/history$`, "i"),
  new RegExp(`^/events/${UUID_SEGMENT}$`, "i"),
];

/** Whether a role is entitled to a nav section, keyed by its route path. */
export function isPathAllowedForRole(pathname: string, role: UserRole) {
  if (role === "event_coordinator_lead") {
    return LEAD_ALLOWED_EVENT_PATHS.some((pattern) => pattern.test(pathname));
  }
  return getNavItemsForRole(role).some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}
