import type { UserRole } from "../types/role";

// This table is for UI gating only (e.g. hide/show a button). Real
// authorization is enforced in Postgres via RLS policies and
// `current_user_role()` / `can_view_event()` — see supabase/migrations.
const permissions = {
  createEvent: ["event_organiser", "administrator"],
  reviewEvent: ["event_coordinator", "administrator"],
  manageVenue: ["venue_staff", "administrator"],
  reserveEquipment: ["technical_support_staff", "administrator"],
  registerForEvent: ["attendee", "administrator"],
} as const satisfies Record<string, readonly UserRole[]>;

export type Permission = keyof typeof permissions;

export function hasPermission(role: UserRole, permission: Permission) {
  return (permissions[permission] as readonly UserRole[]).includes(role);
}
