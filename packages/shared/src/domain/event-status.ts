export const eventStatuses = [
  "draft",
  "requested",
  "submitted",
  "clarification_requested",
  "under_review",
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
 * PB-03 adds draft -> requested. PB-08 owns retiring "submitted",
 * "under_review" and "approved" in favour of the backlog's "planning" and
 * "completed", so those arms stay for now.
 */
export const allowedEventStatusTransitions: Readonly<
  Record<EventStatus, readonly EventStatus[]>
> = {
  draft: ["requested", "submitted", "cancelled"],
  requested: [
    "clarification_requested",
    "under_review",
    "approved",
    "rejected",
    "cancelled",
  ],
  submitted: ["clarification_requested", "under_review", "cancelled"],
  clarification_requested: ["requested", "submitted", "cancelled"],
  under_review: [
    "clarification_requested",
    "approved",
    "rejected",
    "cancelled",
  ],
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
