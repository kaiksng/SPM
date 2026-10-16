/**
 * The fields PB-07's change history can report on — one entry per scalar
 * column the `record_event_field_change`/`record_event_venue_change`/
 * `record_event_registration_change` triggers watch in
 * `202609150003_pb07_event_field_history.sql`, plus `venue.facilities`
 * (`record_event_facility_change`, 202610160003: one entry per facility
 * added or removed). Keep the two in step: the database CHECK constraint on
 * `event_field_changes.field_name` accepts exactly this list.
 */
export const eventFieldHistoryKeys = [
  "title",
  "purpose",
  "description",
  "eventType",
  "expectedAttendance",
  "startsAt",
  "endsAt",
  "venue.preferredLocation",
  "venue.minimumCapacity",
  "venue.accessibilityNotes",
  "venue.layoutNotes",
  "venue.facilities",
  "registration.required",
  "registration.opensAt",
  "registration.closesAt",
  "registration.capacity",
  "registration.waitlistEnabled",
] as const;

export type EventFieldHistoryKey = (typeof eventFieldHistoryKeys)[number];

/** Human labels for the change-history list. */
export const eventFieldHistoryLabels: Readonly<Record<EventFieldHistoryKey, string>> = {
  title: "Event name",
  purpose: "Purpose",
  description: "Description",
  eventType: "Event type",
  expectedAttendance: "Expected attendance",
  startsAt: "Start time",
  endsAt: "End time",
  "venue.preferredLocation": "Preferred location",
  "venue.minimumCapacity": "Minimum capacity",
  "venue.accessibilityNotes": "Accessibility notes",
  "venue.layoutNotes": "Layout notes",
  "venue.facilities": "Required facility",
  "registration.required": "Registration required",
  "registration.opensAt": "Registration opens",
  "registration.closesAt": "Registration closes",
  "registration.capacity": "Registration capacity",
  "registration.waitlistEnabled": "Waitlist enabled",
};

const dateFieldKeys = new Set<string>([
  "startsAt",
  "endsAt",
  "registration.opensAt",
  "registration.closesAt",
]);

const booleanFieldKeys = new Set<string>(["registration.required", "registration.waitlistEnabled"]);

/** The stored text is an ISO 8601 UTC timestamp for these fields. */
export function isEventFieldHistoryDateField(fieldName: string) {
  return dateFieldKeys.has(fieldName);
}

/** The stored text is the literal string "true"/"false" for these fields. */
export function isEventFieldHistoryBooleanField(fieldName: string) {
  return booleanFieldKeys.has(fieldName);
}

export function eventFieldHistoryLabel(fieldName: string) {
  return (eventFieldHistoryLabels as Record<string, string>)[fieldName] ?? fieldName;
}
