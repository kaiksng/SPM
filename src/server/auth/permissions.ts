import type { UserRole } from "@/features/auth/types/role";

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
