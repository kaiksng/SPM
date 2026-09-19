import { getNavItemsForRole } from "./navigation";
import type { UserRole } from "../types/role";

/**
 * Maps a signed-in user's role to the page they should land on after
 * authenticating: the first section in their own workspace nav. Deriving
 * this from the nav config (rather than hardcoding "/home" for every role)
 * keeps the two in step — attendees, for instance, have no "/home" in their
 * nav, so sending them there landed on a page their own sidebar can't reach.
 */
export function getRoleDestination(role: UserRole): string {
  const [primaryItem] = getNavItemsForRole(role);
  return primaryItem?.href ?? "/home";
}
