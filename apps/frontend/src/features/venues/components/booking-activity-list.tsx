import type { BookingActivityEntry, BookingActivityKind } from "@/features/venues/utils/booking-activity";

const dateFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

const KIND_CLASSES: Record<BookingActivityKind, string> = {
  requested: "border-slate-200 bg-white text-slate-700",
  main: "border-primary/30 bg-accent text-primary",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-red-200 bg-red-50 text-red-700",
  withdrawn: "border-slate-200 bg-slate-100 text-slate-600",
  cancelled: "border-slate-200 bg-slate-100 text-slate-600",
  hold_expired: "border-orange-200 bg-orange-50 text-orange-800",
  replacement_requested: "border-amber-200 bg-amber-50 text-amber-800",
  replaced: "border-amber-200 bg-amber-50 text-amber-800",
  disrupted: "border-red-200 bg-red-50 text-red-800",
};

/**
 * A time-ordered log of what happened to venue bookings, newest first. In an
 * event's history each entry names the booking and its venue; in a venue's
 * Activity section (`showEvent`) it also names the event it was for.
 */
export function BookingActivityList({
  entries,
  showEvent = false,
  emptyText,
}: {
  entries: BookingActivityEntry[];
  showEvent?: boolean;
  emptyText: string;
}) {
  if (entries.length === 0) return <p className="text-sm text-slate-500">{emptyText}</p>;

  return (
    <ol className="space-y-2">
      {entries.map((entry) => (
        <li key={entry.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="flex flex-wrap items-baseline gap-x-1.5">
              {showEvent && (
                <>
                  <span className="font-medium text-slate-800">{entry.eventTitle}</span>
                  <span aria-hidden="true" className="text-slate-400">·</span>
                </>
              )}
              <span className="font-medium text-slate-800">{entry.label}</span>
              <span aria-hidden="true" className="text-slate-400">·</span>
              <span className="text-slate-600">{entry.venueName}</span>
            </span>
            <span className="text-xs text-slate-500">{dateFormatter.format(new Date(entry.at))}</span>
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${KIND_CLASSES[entry.kind]}`}
            >
              {entry.title}
            </span>
            {entry.actor && <span className="text-xs text-slate-500">by {entry.actor}</span>}
          </p>
          {entry.detail && (
            <p className="mt-1 text-slate-600">
              {entry.kind === "rejected" || entry.kind === "withdrawn" || entry.kind === "cancelled"
                ? `Reason: "${entry.detail}"`
                : entry.kind === "approved"
                  ? `Notes: "${entry.detail}"`
                  : entry.detail}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
