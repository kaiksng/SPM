export const eventStatuses = [
  "draft",
  "requested",
  "submitted",
  "clarification_requested",
  "under_review",
  "planning",
  "approved",
  "rejected",
  "confirmed",
  "completed",
  "cancelled",
] as const;

export type EventStatus = (typeof eventStatuses)[number];

/**
 * Mirrors public.event_status_transition_allowed in the database, which is the
 * authoritative rule. Keep the two in step: a transition permitted here but
 * refused there surfaces as a failed write rather than a blocked button.
 *
 * "As an authorised user, I want to see an event's current lifecycle status"
 * retires "submitted" and "under_review" as reachable targets — flagged as
 * this story's job by PB-03 and "Approve or Reject an Event Request" back
 * when they first noticed nothing ever produces either value. "approved" is
 * left exactly as those stories left it (unreachable, but not this story's
 * to retire either) — the same "add, don't remove an already-listed arm
 * outside what a story actually asks" policy applies here. "completed" is
 * new: an event's terminal, successful end state, reached only from
 * "confirmed" via public.complete_event.
 */
export const allowedEventStatusTransitions: Readonly<
  Record<EventStatus, readonly EventStatus[]>
> = {
  draft: ["requested", "cancelled"],
  requested: ["clarification_requested", "planning", "rejected", "cancelled"],
  submitted: [],
  clarification_requested: ["requested", "cancelled"],
  under_review: [],
  planning: ["confirmed", "cancelled"],
  approved: ["confirmed", "cancelled"],
  rejected: [],
  confirmed: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransitionEventStatus(from: EventStatus, to: EventStatus) {
  return allowedEventStatusTransitions[from].includes(to);
}

/**
 * Statuses an event reaches only after it has been submitted for review —
 * the list view labels it differently from a draft (PB-02 AC03, PB-03 AC05).
 * A Requested event may still be cancelled by its organiser (see
 * public.cancel_event_request), just no longer deleted outright the way a
 * draft can be.
 */
export const submittedEventStatuses = eventStatuses.filter(
  (status) => status !== "draft",
);

export function isSubmittedEventStatus(status: EventStatus) {
  return status !== "draft";
}

/**
 * AC07 of "Approve or Reject an Event Request": once Rejected, venue and
 * equipment planning actions are blocked. No such action exists in this
 * codebase yet (Venues/Equipment are unbuilt placeholder pages) — this is a
 * forward-compatible primitive, mirroring public.event_planning_allowed, for
 * whichever story builds that feature to call rather than re-deriving the
 * rule.
 */
export function isPlanningAllowed(status: EventStatus) {
  return status !== "rejected" && status !== "cancelled";
}

/**
 * "Block Direct Edits on Finalized Events": once an event reaches Confirmed,
 * Completed, Rejected, or Cancelled, neither the organiser nor the
 * coordinator may edit it directly — only a change request can move it
 * further. Mirrors the exclusion list "coordinators manage assigned events"
 * enforces in the database (202609150007, extended to Completed by
 * 202609190002); the organiser's own block predates both — save_event_draft's
 * status gate never allowed any of these four.
 */
export function isDirectEditBlocked(status: string) {
  return (
    status === "confirmed" ||
    status === "completed" ||
    status === "rejected" ||
    status === "cancelled"
  );
}
