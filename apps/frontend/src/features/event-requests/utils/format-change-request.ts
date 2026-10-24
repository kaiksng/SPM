import type { EventChangeRequestSummary } from "@/features/event-requests/services/change-requests";

/** Mirrors submit_event_change_request's own status gate (202610200013). */
export const CHANGE_REQUEST_SUBMITTABLE_STATUSES = new Set([
  "requested",
  "planning",
  "confirmed",
  "pending_safety_check",
]);

export function describeRequestedChanges(requestedChanges: Record<string, unknown>) {
  const description = requestedChanges.description;
  return typeof description === "string" && description.length > 0
    ? description
    : "Requested change";
}

export function changeRequestStatusLabel(status: EventChangeRequestSummary["status"]) {
  switch (status) {
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "withdrawn":
      return "Withdrawn";
    case "implemented":
      return "Implemented";
    default:
      return "Pending Review";
  }
}
