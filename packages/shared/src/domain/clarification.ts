/**
 * The buckets a coordinator may permit an organiser to edit while a
 * clarification is open. Coarse, section-level buckets matching
 * EventRequestForm's own sections rather than individual fields — mirrors the
 * `clarifications_permitted_fields_known` CHECK constraint in
 * `202609140003_event_clarifications.sql`/`202609150004_clarification_requirement_buckets.sql`.
 * Keep the two in step.
 *
 * "venue", "equipment" and "registration" replace the single combined
 * "requirements" bucket (202609150004): a coordinator who only needs the
 * registration answer fixed can now grant exactly that, instead of also
 * unlocking venue and equipment editing as a side effect.
 */
export const clarificationPermittedFieldKeys = [
  "title",
  "purpose",
  "description",
  "expectedAttendance",
  "startsAt",
  "endsAt",
  "venue",
  "equipment",
  "registration",
] as const;

export type ClarificationPermittedField =
  (typeof clarificationPermittedFieldKeys)[number];

/**
 * Human labels for the request dialog's checkboxes and the locked-field
 * banner. Includes "requirements" — the retired combined bucket — purely so
 * an already-stored clarification row from before the split still renders a
 * label instead of its raw field key; it is deliberately absent from
 * clarificationPermittedFieldKeys, so it is never offered for a new request.
 * "eventType" is retired the same way: the event form has no Event type field
 * (Purpose covers it), so an organiser granted it had nothing to edit.
 */
export const clarificationPermittedFieldLabels: Readonly<
  Record<ClarificationPermittedField | "requirements" | "eventType", string>
> = {
  title: "Event name",
  purpose: "Purpose",
  description: "Description",
  eventType: "Event type",
  expectedAttendance: "Expected attendance",
  startsAt: "Start time",
  endsAt: "End time",
  venue: "Venue requirements",
  equipment: "Equipment and technical needs",
  registration: "Registration needs",
  requirements: "Venue, equipment and registration requirements",
};

export type ClarificationStatus = "open" | "answered" | "resolved";

/** A clarification is unresolved while awaiting either a response or a close. */
export function isUnresolvedClarificationStatus(status: ClarificationStatus) {
  return status === "open" || status === "answered";
}
