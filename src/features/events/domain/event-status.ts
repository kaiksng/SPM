export const eventStatuses = [
  "draft",
  "submitted",
  "clarification_requested",
  "under_review",
  "approved",
  "rejected",
  "confirmed",
  "cancelled",
] as const;

export type EventStatus = (typeof eventStatuses)[number];

export const allowedEventStatusTransitions: Readonly<
  Record<EventStatus, readonly EventStatus[]>
> = {
  draft: ["submitted", "cancelled"],
  submitted: ["clarification_requested", "under_review", "cancelled"],
  clarification_requested: ["submitted", "cancelled"],
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
