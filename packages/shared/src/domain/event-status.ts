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
  "cancelled",
] as const;

export type EventStatus = (typeof eventStatuses)[number];

/**
 * Mirrors public.event_status_transition_allowed in the database, which is the
 * authoritative rule. Keep the two in step: a transition permitted here but
 * refused there surfaces as a failed write rather than a blocked button.
 *
 * PB-03 adds draft -> requested. "Approve or Reject an Event Request" (AC02)
 * adds requested -> planning, replacing requested -> approved: approving now
 * produces "Planning", not "approved". The "approved" arm is left in place
 * rather than removed — same policy PB-03 used for "submitted"/"under_review"
 * — since nothing currently reaches it, but retiring it outright is a
 * separate decision than this story makes. PB-08 still owns retiring
 * "submitted"/"under_review" in favour of "completed".
 */
export const allowedEventStatusTransitions: Readonly<
  Record<EventStatus, readonly EventStatus[]>
> = {
  draft: ["requested", "submitted", "cancelled"],
  requested: [
    "clarification_requested",
    "under_review",
    "planning",
    "rejected",
    "cancelled",
  ],
  submitted: ["clarification_requested", "under_review", "cancelled"],
  clarification_requested: ["requested", "submitted", "cancelled"],
  under_review: [
    "clarification_requested",
    "planning",
    "approved",
    "rejected",
    "cancelled",
  ],
  planning: ["confirmed", "cancelled"],
  approved: ["confirmed", "cancelled"],
  rejected: [],
  confirmed: ["cancelled"],
  cancelled: [],
};

export function canTransitionEventStatus(from: EventStatus, to: EventStatus) {
  return allowedEventStatusTransitions[from].includes(to);
}

/**
 * Statuses an event reaches only after it has been submitted for review. The
 * organiser may no longer delete such a request, and the list view labels it
 * differently from a draft (PB-02 AC03, PB-03 AC05).
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
