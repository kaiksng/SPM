import { isEventFieldHistoryBooleanField, isEventFieldHistoryDateField } from "@spm/shared";

const dateTimeFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * Renders one event_field_changes value for display, applying the same
 * field-type rules (date vs. boolean vs. plain text) wherever a field change
 * is shown — EventHistoryButton's Pre-Approved and Planning sections both use
 * this, so a field's before/after values always read the same way regardless
 * of which stage they appear under.
 */
export function formatEventFieldChangeValue(fieldName: string, value: string | null) {
  if (value === null) return "Not set";
  if (isEventFieldHistoryDateField(fieldName)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : dateTimeFormatter.format(parsed);
  }
  if (isEventFieldHistoryBooleanField(fieldName)) {
    return value === "true" ? "Yes" : "No";
  }
  return value;
}
