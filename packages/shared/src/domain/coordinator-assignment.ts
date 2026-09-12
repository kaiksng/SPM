/**
 * Mirrors the selection rule in public.assign_event_coordinator (PB-04
 * AC01). The SQL function is authoritative — this exists so the least-loaded
 * rule can be unit tested without a database, and so the two stay in step:
 * a change here that isn't reflected in the migration (or vice versa) should
 * be caught by comparing this file's tests against the pgTAP suite.
 */
export type CoordinatorCandidate = {
  id: string;
  activeEventCount: number;
};

/**
 * Picks the candidate with the fewest active events, breaking ties by id so
 * the result is deterministic and testable. Returns undefined when there is
 * no coordinator to assign — the caller (the database function) treats that
 * as a hard failure, since PB-04 AC01 requires every submission to succeed
 * only when assignment can succeed too.
 */
export function selectLeastLoadedCoordinator(
  candidates: readonly CoordinatorCandidate[],
): CoordinatorCandidate | undefined {
  return [...candidates].sort((a, b) => {
    if (a.activeEventCount !== b.activeEventCount) {
      return a.activeEventCount - b.activeEventCount;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0];
}
