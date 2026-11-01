import {
  VENUE_BLOCK_REASON_CATEGORY_LABELS,
  VENUE_DISRUPTION_STATE_LABELS,
  type VenueDisruptionState,
} from "@spm/shared";
import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import type { CoordinatorVenueConflict } from "@/features/venues/services/event-venue-conflicts";
import {
  listVenueDisruptionsForCoordinator,
  type VenueDisruption,
} from "@/features/venues/services/venue-disruptions";

/** Resolved disruptions stay visible this long, then drop out of the view. */
export const RESOLVED_VISIBLE_DAYS = 14;

const dateTimeFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

const STATE_BADGE_CLASS: Record<VenueDisruptionState, string> = {
  replacement_required: "border-red-200 bg-red-50 text-red-800",
  replacement_requested: "border-amber-200 bg-amber-50 text-amber-800",
  resolved: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

/**
 * SPM-83: split a coordinator's disruptions into the ones that still need
 * attention and the ones resolved recently enough to be worth showing. A
 * resolved disruption is dated by when it was cleared, or when it was
 * flagged if it was resolved without being cleared.
 */
export function splitVenueDisruptions(items: VenueDisruption[], now = Date.now()) {
  const cutoff = now - RESOLVED_VISIBLE_DAYS * 24 * 60 * 60 * 1000;
  const open = items.filter((item) => item.state !== "resolved");
  const recentlyResolved = items.filter(
    (item) =>
      item.state === "resolved" && new Date(item.clearedAt ?? item.flaggedAt).getTime() >= cutoff,
  );
  return { open, recentlyResolved };
}

/** Loads the signed-in coordinator's disrupted venue bookings (RLS-scoped). */
export function useVenueDisruptions() {
  const [disruptions, setDisruptions] = useState<VenueDisruption[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    listVenueDisruptionsForCoordinator()
      .then((items) => {
        if (active) setDisruptions(items);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "We couldn't load your affected venue bookings.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return { disruptions, error };
}

function DisruptionStateBadge({ state }: { state: VenueDisruptionState }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${STATE_BADGE_CLASS[state]}`}
    >
      {VENUE_DISRUPTION_STATE_LABELS[state]}
    </span>
  );
}

function DisruptionRow({ item }: { item: VenueDisruption }) {
  const muted = item.state === "resolved";
  return (
    <tr className={muted ? "text-slate-500" : "text-slate-700"}>
      <td className="px-4 py-3 align-top font-semibold">
        <Link
          to={`/events/${item.eventId}/venue`}
          className="text-slate-900 hover:text-primary hover:underline"
        >
          {item.eventTitle}
        </Link>
      </td>
      <td className="px-4 py-3 align-top">{item.venueName}</td>
      <td className="px-4 py-3 align-top whitespace-nowrap">
        {dateTimeFormatter.format(new Date(item.bookingStartsAt))} –{" "}
        {dateTimeFormatter.format(new Date(item.bookingEndsAt))}
      </td>
      <td className="px-4 py-3 align-top">
        {VENUE_BLOCK_REASON_CATEGORY_LABELS[item.blockReasonCategory]}
        {item.blockReason ? ` – ${item.blockReason}` : ""}
      </td>
      <td className="px-4 py-3 align-top">
        <DisruptionStateBadge state={item.state} />
      </td>
      <td className="px-4 py-3 align-top whitespace-nowrap">
        {item.state !== "resolved" && (
          <Link
            to={`/events/${item.eventId}/venue`}
            className="font-medium text-primary hover:underline"
          >
            {item.state === "replacement_requested" ? "View request" : "Find replacement"}
          </Link>
        )}
      </td>
    </tr>
  );
}

/**
 * A booking that has to move because of a conflict found by Venue Staff's
 * re-check. It is replaced the same way as a disrupted one (202611010015).
 */
function ConflictRow({ item }: { item: CoordinatorVenueConflict }) {
  return (
    <tr className="text-slate-700">
      <td className="px-4 py-3 align-top font-semibold">
        <Link
          to={`/events/${item.eventId}/venue`}
          className="text-slate-900 hover:text-primary hover:underline"
        >
          {item.eventTitle}
        </Link>
      </td>
      <td className="px-4 py-3 align-top">{item.venueName}</td>
      <td className="px-4 py-3 align-top whitespace-nowrap">
        {dateTimeFormatter.format(new Date(item.bookingStartsAt))} –{" "}
        {dateTimeFormatter.format(new Date(item.bookingEndsAt))}
      </td>
      <td className="px-4 py-3 align-top">
        {item.blockReason !== null
          ? `Clashes with venue block "${item.blockReason}"`
          : "Clashes with another booking made first"}
      </td>
      <td className="px-4 py-3 align-top">
        <DisruptionStateBadge state={item.state} />
      </td>
      <td className="px-4 py-3 align-top whitespace-nowrap">
        <Link
          to={`/events/${item.eventId}/venue`}
          className="font-medium text-primary hover:underline"
        >
          {item.state === "replacement_requested" ? "View request" : "Find replacement"}
        </Link>
      </td>
    </tr>
  );
}

/**
 * SPM-83: a table of the coordinator's events whose venue booking was
 * disrupted by a venue block. The events are not cancelled; an alternative is
 * needed. Open items are listed first; recently resolved ones are behind a
 * toggle. Nothing renders when there is nothing open or recently resolved.
 * Bookings that have to move because of a conflict are listed with the open
 * ones (they clear once fixed), so every venue problem is in one place.
 */
export function AffectedVenueBookings({
  disruptions,
  conflicts = [],
  error,
}: {
  disruptions: VenueDisruption[];
  conflicts?: CoordinatorVenueConflict[];
  error?: string;
}) {
  const [showResolved, setShowResolved] = useState(false);

  if (error) {
    return (
      <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error}
      </p>
    );
  }

  const { open, recentlyResolved } = splitVenueDisruptions(disruptions);
  const openCount = open.length + conflicts.length;
  if (openCount === 0 && recentlyResolved.length === 0) return null;
  return (
    <section aria-label="Affected venue bookings" className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
            <AlertTriangle className="size-4 text-red-600" aria-hidden="true" />
            Affected venue bookings
            {openCount > 0 && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800">
                {openCount} open
              </span>
            )}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            A venue became unavailable or clashes with another booking for these bookings. The events
            have not been cancelled; alternative arrangements are required.
          </p>
        </div>
        {recentlyResolved.length > 0 && (
          <button
            type="button"
            aria-expanded={showResolved}
            onClick={() => setShowResolved((current) => !current)}
            className="text-sm font-medium text-primary hover:underline"
          >
            {showResolved ? "Hide resolved" : `Show resolved (${recentlyResolved.length})`}
          </button>
        )}
      </div>

      <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        {openCount === 0 && !showResolved ? (
          <p className="px-4 py-4 text-sm text-slate-500">No open affected bookings.</p>
        ) : (
          <table className="w-full min-w-[820px] text-left text-sm">
            <caption className="sr-only">Venue bookings affected by a venue block</caption>
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th scope="col" className="px-4 py-2.5">Event</th>
                <th scope="col" className="px-4 py-2.5">Venue</th>
                <th scope="col" className="px-4 py-2.5">Booking period</th>
                <th scope="col" className="px-4 py-2.5">Reason</th>
                <th scope="col" className="px-4 py-2.5">Status</th>
                <th scope="col" className="px-4 py-2.5">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {open.map((item) => (
                <DisruptionRow key={item.id} item={item} />
              ))}
              {conflicts.map((item) => (
                <ConflictRow key={item.bookingId} item={item} />
              ))}
              {showResolved && recentlyResolved.map((item) => (
                <DisruptionRow key={item.id} item={item} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
