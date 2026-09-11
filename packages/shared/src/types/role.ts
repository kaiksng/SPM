import type { Database } from "./database.types";

export type UserRole = Database["public"]["Enums"]["user_role"];

export const staffRoles = [
  "event_coordinator",
  "venue_staff",
  "technical_support_staff",
  "administrator",
] as const satisfies readonly UserRole[];
