import { getNavItemsForRole } from "./navigation";
import type { UserRole } from "../types/role";

/**
 * Maps a signed-in user's role to the page they should land on after
 * authenticating: the first section in their own workspace nav. Deriving
 * this from the nav config (rather than hardcoding one shared landing page)
 * keeps the two in step — every role's nav lists at least one section, so
 * the fallback below is only reached if that ever stops being true.
 */
export function getRoleDestination(role: UserRole): string {
  const [primaryItem] = getNavItemsForRole(role);
  return primaryItem?.href ?? "/login";
}
