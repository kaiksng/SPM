import { useEffect, useState } from "react";
import { useParams } from "react-router";

import { useAuth } from "@/context/auth-context";
import { EventPageTopBar } from "@/features/event-requests/components/event-page-top-bar";
import { loadEventDetail, type EventDetail } from "@/features/event-requests/services/event-details";
import {
  listEventRegistrations,
  type EventRegistrationEntry,
} from "@/features/registrations/services/registrations";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

const dateTimeFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

const STATUS_LABELS: Record<string, string> = {
  registered: "Registered",
  waitlisted: "Waitlisted",
  withdrawn: "Withdrawn",
  event_cancelled: "Event cancelled",
};

const STATUS_BADGE_CLASSES: Record<string, string> = {
  registered: "bg-emerald-100 text-emerald-800",
  waitlisted: "bg-orange-100 text-orange-800",
  withdrawn: "bg-slate-200 text-slate-600",
  event_cancelled: "bg-red-100 text-red-700",
};

type StatusFilter = "all" | "registered" | "waitlisted" | "withdrawn" | "event_cancelled";

/**
 * View Event Registration Information: capacity, counts by status, and
 * every attendee's name/status/registered time/waiting-list position — for
 * the organiser, the assigned coordinator, or the Event Coordinator Lead.
 * Its own query (listEventRegistrations), not the event-detail loader — no
 * venue or equipment data reaches this page at all.
 */
export function EventRegistrationsPage() {
  const { eventId } = useParams();
  const { profile, user } = useAuth();
  const [event, setEvent] = useState<EventDetail>();
  const [registrations, setRegistrations] = useState<EventRegistrationEntry[]>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [filter, setFilter] = useState<StatusFilter>("all");

  usePageTitle(event?.title ? `Registrations — ${event.title}` : "Event registrations");

  useEffect(() => {
    if (!eventId) return;
    let active = true;
    setLoading(true);
    Promise.all([loadEventDetail(eventId), listEventRegistrations(eventId)])
      .then(([detail, entries]) => {
        if (!active) return;
        setEvent(detail);
        setRegistrations(entries);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "This event is unavailable or you do not have access to it.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [eventId]);

  // Same reasoning as EventDetailPage's isUnassignedCoordinator: RLS lets
  // any event_coordinator read an event's registrations, not just the one
  // assigned to it, so "only their assigned events" is enforced here too.
  const isUnassignedCoordinator =
    !!event && profile?.role === "event_coordinator" && event.assignedCoordinatorId !== user?.id;

  const counts = {
    registered: registrations?.filter((r) => r.status === "registered").length ?? 0,
    waitlisted: registrations?.filter((r) => r.status === "waitlisted").length ?? 0,
    withdrawn: registrations?.filter((r) => r.status === "withdrawn").length ?? 0,
    event_cancelled: registrations?.filter((r) => r.status === "event_cancelled").length ?? 0,
  };
  const total = (registrations ?? []).length;
  const filtered = (registrations ?? []).filter((r) => filter === "all" || r.status === filter);
  // Registrations a cancellation took with it (202611010007): shown only
  // where there are any, so ordinary events keep their three counts.
  const showCancelled = counts.event_cancelled > 0;
  const filterOptions = [
    "all",
    "registered",
    "waitlisted",
    "withdrawn",
    ...(showCancelled ? ["event_cancelled"] : []),
  ] as StatusFilter[];

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-4xl">
          <EventPageTopBar backTo={`/events/${eventId}`} backLabel="Back to event" eventId={eventId} />

          {loading ? (
            <div className="mt-7 h-96 animate-pulse rounded-2xl bg-slate-200/70 motion-reduce:animate-none" />
          ) : error || !event || !registrations || isUnassignedCoordinator ? (
            <section className="mt-7 rounded-2xl border border-red-200 bg-red-50 p-6">
              <h1 className="font-semibold text-red-900">Event unavailable</h1>
              <p role="alert" className="mt-2 text-sm text-red-800">
                {error ?? "This event is unavailable or you do not have access to it."}
              </p>
            </section>
          ) : (
            <div className="mt-6">
              <h1 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950">
                {event.title}
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                {event.startsAt && event.endsAt
                  ? `${dateTimeFormatter.format(new Date(event.startsAt))} – ${dateTimeFormatter.format(new Date(event.endsAt))}`
                  : "Schedule not set"}
                {event.venue.preferredLocation && ` · ${event.venue.preferredLocation}`}
              </p>

              {event.registration.capacity !== null && (
                <div className="mt-5">
                  <p className="mb-1.5 text-sm text-slate-700">
                    <span className="font-semibold">{counts.registered}</span> of{" "}
                    {event.registration.capacity} places filled
                  </p>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${Math.min((counts.registered / event.registration.capacity) * 100, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              <div className={`mt-5 grid gap-3 ${showCancelled ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
                <CountTile label="Registered" count={counts.registered} className="border-emerald-200 bg-emerald-50 text-emerald-800" />
                <CountTile label="Waitlisted" count={counts.waitlisted} className="border-orange-200 bg-orange-50 text-orange-800" />
                <CountTile label="Withdrawn" count={counts.withdrawn} className="border-slate-200 bg-slate-100 text-slate-600" />
                {showCancelled && (
                  <CountTile label="Event cancelled" count={counts.event_cancelled} className="border-red-200 bg-red-50 text-red-700" />
                )}
              </div>

              <div role="group" aria-label="Filter by status" className="mt-5 flex flex-wrap gap-2">
                {filterOptions.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value)}
                    className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
                      filter === value
                        ? "border-primary bg-accent text-primary"
                        : "border-slate-200 bg-white text-slate-600 hover:border-primary/40"
                    }`}
                  >
                    {value === "all" ? "All" : STATUS_LABELS[value]} (
                    {value === "all" ? total : counts[value]})
                  </button>
                ))}
              </div>

              {filtered.length === 0 ? (
                <p className="mt-6 text-sm text-slate-500">No registrations match this filter.</p>
              ) : (
                <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs font-semibold tracking-wide text-slate-400 uppercase">
                        <th className="px-4 py-3">Attendee</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Registered</th>
                        <th className="px-4 py-3">Waiting-list position</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((entry) => (
                        <tr key={entry.id} className="border-b border-slate-100 last:border-0">
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {entry.attendeeName ?? "Unknown"}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${STATUS_BADGE_CLASSES[entry.status] ?? "bg-slate-100 text-slate-600"}`}
                            >
                              {STATUS_LABELS[entry.status] ?? entry.status}
                            </span>
                            {entry.status === "event_cancelled" && entry.statusBeforeCancellation && (
                              <span className="ml-2 text-xs text-slate-500">
                                (was {entry.statusBeforeCancellation === "waitlisted" ? "on the waiting list" : "Registered"})
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-500">
                            {dateTimeFormatter.format(new Date(entry.registeredAt))}
                          </td>
                          <td className="px-4 py-3 text-slate-500">
                            {entry.waitlistPosition ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </RoleGate>
  );
}

function CountTile({ label, count, className }: { label: string; count: number; className: string }) {
  return (
    <div className={`rounded-xl border p-3 ${className}`}>
      <p className="text-xl font-bold">{count}</p>
      <p className="mt-0.5 text-xs font-semibold tracking-wide uppercase opacity-80">{label}</p>
    </div>
  );
}
