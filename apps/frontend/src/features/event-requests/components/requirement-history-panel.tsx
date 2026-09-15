import {
  eventFieldHistoryLabel,
  isEventFieldHistoryBooleanField,
  isEventFieldHistoryDateField,
} from "@spm/shared";
import { useEffect, useState } from "react";

import {
  loadEventFieldHistory,
  type EventFieldChange,
} from "@/features/event-requests/services/field-history";

const dateTimeFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatValue(fieldName: string, value: string | null) {
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

/**
 * PB-07: the coordinator's view of how a Planning event's requirements got to
 * their current state — every prior update with its previous value, new
 * value, actor, and timestamp, in sequence. RLS (event_field_changes' "assigned
 * coordinator views field change history" policy) is the actual
 * authorisation boundary (AC03/AC04); this component only decides when it's
 * relevant to show, gated to a Planning event viewed by a coordinator, same
 * as the given/when scenario. An organiser or an unassigned coordinator who
 * somehow reaches this component gets an empty list from Supabase, not an
 * error — RLS filters rows rather than raising.
 */
export function RequirementHistoryPanel({
  eventId,
  eventStatus,
  role,
  className = "mt-4 rounded-2xl border border-slate-200 bg-white p-6",
}: {
  eventId: string;
  eventStatus: string;
  role: "organiser" | "coordinator";
  className?: string;
}) {
  const [changes, setChanges] = useState<EventFieldChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const shouldRender = role === "coordinator" && eventStatus === "planning";

  useEffect(() => {
    if (!shouldRender) return;

    let active = true;
    setLoading(true);
    loadEventFieldHistory(eventId)
      .then((items) => {
        if (active) setChanges(items);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "The change history for this event is unavailable.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [eventId, shouldRender]);

  if (!shouldRender) return null;

  return (
    <section className={className}>
      <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">
        Change history
      </h2>

      {loading ? (
        <div className="mt-4 h-20 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none" />
      ) : error ? (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      ) : changes.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          No changes have been recorded for this event yet.
        </p>
      ) : (
        <ol className="mt-4 space-y-3">
          {changes.map((change) => (
            <li
              key={change.id}
              className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="font-medium text-slate-800">
                  {eventFieldHistoryLabel(change.fieldName)}
                </span>
                <span className="text-xs text-slate-500">
                  {dateTimeFormatter.format(new Date(change.changedAt))}
                  {change.changedByName ? ` · ${change.changedByName}` : ""}
                </span>
              </div>
              <p className="mt-1 text-slate-600">
                <span className="text-slate-400 line-through">
                  {formatValue(change.fieldName, change.previousValue)}
                </span>{" "}
                → <span className="text-slate-800">{formatValue(change.fieldName, change.newValue)}</span>
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
