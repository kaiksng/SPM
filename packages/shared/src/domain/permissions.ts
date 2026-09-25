import type { UserRole } from "../types/role";

// This table is for UI gating only (e.g. hide/show a button). Real
// authorization is enforced in Postgres via RLS policies and
// `current_user_role()` / `can_view_event()` — see supabase/migrations.
const permissions = {
  createEvent: ["event_organiser"],
  reviewEvent: ["event_coordinator"],
  manageVenue: ["venue_staff"],
  reserveEquipment: ["technical_support_staff"],
  registerForEvent: ["attendee"],
} as const satisfies Record<string, readonly UserRole[]>;

export type Permission = keyof typeof permissions;

export function hasPermission(role: UserRole, permission: Permission) {
  return (permissions[permission] as readonly UserRole[]).includes(role);
}
