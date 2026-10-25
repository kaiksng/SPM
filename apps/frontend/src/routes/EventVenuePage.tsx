import { VENUE_BLOCK_REASON_CATEGORY_LABELS, VENUE_DISRUPTION_STATE_LABELS } from "@spm/shared";
import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router";

import { EventPageTopBar } from "@/features/event-requests/components/event-page-top-bar";
import { EventPlanningTimeline } from "@/features/event-requests/components/event-planning-timeline";
import { SuggestedVenuesPanel } from "@/features/event-requests/components/suggested-venues-panel";
import {
  loadEventDetail,
  type EventDetail,
} from "@/features/event-requests/services/event-details";
import { AdditionalVenuePanel } from "@/features/venues/components/additional-venue-panel";
import {
  EventVenueBookings,
  isActiveVenueBooking,
} from "@/features/venues/components/event-venue-bookings";
import {
  listVenueDisruptionsForCoordinator,
  type VenueDisruption,
} from "@/features/venues/services/venue-disruptions";
import {
  confirmVenueBookingHold,
  listVenueBookingsForEvent,
  setMainVenueBooking,
  withdrawVenueBookingRequest,
  type VenueBookingRequestSummary,
} from "@/features/venues/services/venue-bookings";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

const dateTimeFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

/**
 * The "Venue" sub-step of an event's Planning stage — its own page rather
 * than inline on EventDetailPage, reached by clicking "Venue" in the
 * sidebar. Keeps the same EventPlanningTimeline sidebar so a coordinator
 * doesn't lose their place in the event's lifecycle while looking at
 * suggested venues.
 */
export function EventVenuePage() {
  const { eventId } = useParams();
  const [event, setEvent] = useState<EventDetail>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  // SPM-85: every venue booking of the event, not just one.
  const [bookings, setBookings] = useState<VenueBookingRequestSummary[]>([]);
  // SPM-82: this event's disrupted venue booking, if one still needs a replacement.
  const [disruption, setDisruption] = useState<VenueDisruption>();
  const [busyBookingId, setBusyBookingId] = useState<string>();
  const [actionError, setActionError] = useState<{ bookingId: string; message: string }>();

  usePageTitle(event?.title ? `Venue — ${event.title}` : "Venue");

  function loadAll(id: string) {
    let active = true;
    setLoading(true);
    Promise.all([
      loadEventDetail(id),
      listVenueBookingsForEvent(id),
      // Non-critical: without it the page simply behaves as it did before SPM-82.
      listVenueDisruptionsForCoordinator().catch(() => [] as VenueDisruption[]),
    ])
      .then(([detail, venueBookings, disruptions]) => {
        if (!active) return;
        setEvent(detail);
        setBookings(venueBookings);
        setDisruption(
          disruptions.find((item) => item.eventId === id && item.state !== "resolved"),
        );
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
  }

  useEffect(() => {
    if (!eventId) return;
    return loadAll(eventId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // The dialog shows any error itself, so this one lets it through.
  async function handleWithdraw(bookingId: string, reason: string) {
    await withdrawVenueBookingRequest(bookingId, reason);
    // Reload so the list, the main-venue flag and any disrupted original are current.
    if (eventId) loadAll(eventId);
  }

  async function handleSetMain(bookingId: string) {
    setBusyBookingId(bookingId);
    setActionError(undefined);
    try {
      await setMainVenueBooking(bookingId);
      if (eventId) loadAll(eventId);
    } catch (err) {
      setActionError({
        bookingId,
        message: err instanceof Error ? err.message : "The main venue could not be changed.",
      });
    } finally {
      setBusyBookingId(undefined);
    }
  }

  async function handleConfirmHold(bookingId: string) {
    setBusyBookingId(bookingId);
    setActionError(undefined);
    try {
      await confirmVenueBookingHold(bookingId);
      if (eventId) loadAll(eventId);
    } catch (err) {
      setActionError({
        bookingId,
        message: err instanceof Error ? err.message : "This hold could not be confirmed.",
      });
    } finally {
      setBusyBookingId(undefined);
    }
  }

  const activeBookings = bookings.filter(isActiveVenueBooking);
  const mainBooking = activeBookings.find((booking) => booking.isMainVenue && !booking.replacesBookingId);
  const mainVenueArea = mainBooking?.venueAreaTags[0] ?? mainBooking?.venueLocation ?? null;
  const needsReplacement = disruption?.state === "replacement_required";
  // SPM-46 AC07: the database refuses every venue booking change on a
  // Completed event, so offer none — no requests, withdrawals or cancellations.
  const isCompleted = event?.status === "completed";

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-5xl">
          <EventPageTopBar backTo={`/events/${eventId}`} backLabel="Back to event" eventId={eventId} />

          {loading ? (
            <div className="mt-7 h-96 animate-pulse rounded-2xl bg-slate-200/70 motion-reduce:animate-none" />
          ) : error || !event || !eventId ? (
            <section className="mt-7 rounded-2xl border border-red-200 bg-red-50 p-6">
              <h1 className="font-semibold text-red-900">Event unavailable</h1>
              <p role="alert" className="mt-2 text-sm text-red-800">
                {error ?? "This event could not be found."}
              </p>
            </section>
          ) : (
            <div className="mt-6 lg:flex lg:items-start lg:gap-10">
              <div className="mb-6 lg:mb-0 lg:sticky lg:top-24">
                <EventPlanningTimeline status={event.status} eventId={event.id} />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950">
                  Venue
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  Review venues matching the event, or search for alternatives. Check a different location with the organiser before requesting it.
                </p>

                <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
                  <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">
                    Venue requirements
                  </h2>
                  <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <dt className="text-xs font-medium text-slate-400">Event schedule</dt>
                      <dd className="mt-1 text-sm text-slate-800">
                        {event.startsAt && event.endsAt
                          ? `${dateTimeFormatter.format(new Date(event.startsAt))} – ${dateTimeFormatter.format(new Date(event.endsAt))}`
                          : "Not provided"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-400">Expected attendance</dt>
                      <dd className="mt-1 text-sm text-slate-800">
                        {event.expectedAttendance != null
                          ? `${event.expectedAttendance} attendees`
                          : "Not provided"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-400">Preferred location</dt>
                      <dd className="mt-1 text-sm text-slate-800">
                        {event.venue.preferredLocation || "Not provided"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-400">Room layout</dt>
                      <dd className="mt-1 text-sm text-slate-800">
                        {event.venue.layoutNotes || "Not provided"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-400">Accessibility</dt>
                      <dd className="mt-1 text-sm text-slate-800">
                        {event.venue.accessibilityNotes || "Not provided"}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs font-medium text-slate-400">Required facilities</dt>
                      <dd className="mt-2 flex flex-wrap gap-1.5">
                        {event.venue.facilities.length > 0 ? (
                          event.venue.facilities.map((facility) => (
                            <span
                              key={facility}
                              className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600"
                            >
                              {facility}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-slate-500">None required</span>
                        )}
                      </dd>
                    </div>
                  </dl>
                </section>

                {disruption && (
                  <section
                    aria-label="Disrupted venue booking"
                    className="mt-4 rounded-2xl border border-red-200 bg-red-50/40 p-6"
                  >
                    <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-red-900 uppercase">
                      <AlertTriangle className="size-4 text-red-600" aria-hidden="true" />
                      Disrupted venue booking
                    </h2>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">{disruption.venueName}</span>
                      <span className="inline-block rounded-full border border-red-200 bg-white px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-red-800">
                        {VENUE_DISRUPTION_STATE_LABELS[disruption.state]}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      {dateTimeFormatter.format(new Date(disruption.bookingStartsAt))}
                      {" – "}
                      {dateTimeFormatter.format(new Date(disruption.bookingEndsAt))}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {VENUE_BLOCK_REASON_CATEGORY_LABELS[disruption.blockReasonCategory]}
                      {disruption.blockReason ? ` – ${disruption.blockReason}` : ""}
                    </p>
                    <p className="mt-3 text-sm text-slate-700">
                      {disruption.state === "replacement_requested"
                        ? "A replacement has been requested. This booking stays until Venue Staff approve it."
                        : "The venue became unavailable. The event has not been cancelled; choose a different venue for the same period below."}
                    </p>
                  </section>
                )}

                {bookings.length > 0 && (
                  <EventVenueBookings
                    bookings={bookings}
                    busyBookingId={busyBookingId}
                    actionError={actionError}
                    canChangeMain={event.status === "planning"}
                    readOnly={isCompleted}
                    onWithdraw={handleWithdraw}
                    onConfirmHold={handleConfirmHold}
                    onSetMain={handleSetMain}
                  />
                )}
                {isCompleted ? (
                  <p role="status" className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
                    This event is completed, so its venue bookings can no longer be changed.
                  </p>
                ) : activeBookings.length > 0 && !needsReplacement && event.status === "planning" ? (
                  <AdditionalVenuePanel event={event} mainVenueArea={mainVenueArea} />
                ) : (
                  <SuggestedVenuesPanel
                    event={event}
                    hasActiveBooking={!needsReplacement && activeBookings.length > 0}
                    replacing={
                      disruption?.state === "replacement_required"
                        ? { bookingId: disruption.bookingId, venueId: disruption.venueId }
                        : undefined
                    }
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </RoleGate>
  );
}
