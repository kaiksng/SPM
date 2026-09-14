/**
 * The buckets a coordinator may permit an organiser to edit while a
 * clarification is open. Coarse, section-level buckets matching
 * EventRequestForm's own sections rather than individual fields — mirrors the
 * `clarifications_permitted_fields_known` CHECK constraint in
 * `202609140003_event_clarifications.sql`. Keep the two in step.
 */
export const clarificationPermittedFieldKeys = [
  "title",
  "purpose",
  "description",
  "eventType",
  "expectedAttendance",
  "startsAt",
  "endsAt",
  "requirements",
] as const;

export type ClarificationPermittedField =
  (typeof clarificationPermittedFieldKeys)[number];

/** Human labels for the request dialog's checkboxes and the locked-field banner. */
export const clarificationPermittedFieldLabels: Readonly<
  Record<ClarificationPermittedField, string>
> = {
  title: "Event name",
  purpose: "Purpose",
  description: "Description",
  eventType: "Event type",
  expectedAttendance: "Expected attendance",
  startsAt: "Start time",
  endsAt: "End time",
  requirements: "Venue, equipment and registration requirements",
};

export type ClarificationStatus = "open" | "answered" | "resolved";

/** A clarification is unresolved while awaiting either a response or a close. */
export function isUnresolvedClarificationStatus(status: ClarificationStatus) {
  return status === "open" || status === "answered";
}
