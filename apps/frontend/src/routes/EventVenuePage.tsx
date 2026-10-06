import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import { Button, buttonVariants } from "@/components/ui/button";
import { EventPlanningTimeline } from "@/features/event-requests/components/event-planning-timeline";
import { SuggestedVenuesPanel } from "@/features/event-requests/components/suggested-venues-panel";
import {
  loadEventDetail,
  type EventDetail,
} from "@/features/event-requests/services/event-details";
import { VenueBookingStatusBadge } from "@/features/venues/components/venue-booking-status-badge";
import {
  confirmVenueBookingHold,
  getActiveVenueBooking,
  withdrawVenueBookingRequest,
  type ActiveVenueBooking,
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
  const [activeBooking, setActiveBooking] = useState<ActiveVenueBooking | null>();
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string>();

  usePageTitle(event?.title ? `Venue — ${event.title}` : "Venue");

  function loadAll(id: string) {
    let active = true;
    setLoading(true);
    Promise.all([loadEventDetail(id), getActiveVenueBooking(id)])
      .then(([detail, booking]) => {
        if (!active) return;
        setEvent(detail);
        setActiveBooking(booking);
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

  async function handleWithdraw() {
    if (!activeBooking) return;
    setWithdrawing(true);
    setWithdrawError(undefined);
    try {
      await withdrawVenueBookingRequest(activeBooking.id);
      setActiveBooking(null);
    } catch (err) {
      setWithdrawError(
        err instanceof Error ? err.message : "This venue booking request could not be withdrawn.",
      );
    } finally {
      setWithdrawing(false);
    }
  }

  async function handleConfirmHold() {
    if (!activeBooking) return;
    setConfirming(true);
    setConfirmError(undefined);
    try {
      await confirmVenueBookingHold(activeBooking.id);
      setActiveBooking({ ...activeBooking, status: "pending" });
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : "This hold could not be confirmed.");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-5xl">
          <Link
            to={`/events/${eventId}`}
            className={buttonVariants({ variant: "ghost", className: "-ml-2" })}
          >
            <ArrowLeft /> Back to event
          </Link>

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

                {activeBooking && (
                  <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
                    <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">
                      Current request
                    </h2>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <VenueBookingStatusBadge status={activeBooking.status} />
                      <span className="text-sm font-medium text-slate-800">
                        {activeBooking.venueName}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      {dateTimeFormatter.format(new Date(activeBooking.startsAt))}
                      {" – "}
                      {dateTimeFormatter.format(new Date(activeBooking.endsAt))}
                    </p>
                    {activeBooking.status === "expired" && (
                      <p className="mt-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
                        This hold expired before it was confirmed. The venue is available again
                        — search or pick a new suggestion to submit another request.
                      </p>
                    )}
                    {activeBooking.status === "on_hold" && activeBooking.expiresAt && (
                      <>
                        <p className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-700">
                          Venue Staff put this request on hold. Confirm by{" "}
                          {dateTimeFormatter.format(new Date(activeBooking.expiresAt))}, or it
                          expires and the venue becomes available to others again.
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          className="mt-4"
                          disabled={confirming}
                          onClick={handleConfirmHold}
                        >
                          {confirming ? "Confirming…" : "Confirm request"}
                        </Button>
                        {confirmError && (
                          <p role="alert" className="mt-2 text-sm text-red-700">
                            {confirmError}
                          </p>
                        )}
                      </>
                    )}
                    {activeBooking.status === "pending" && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-4"
                          disabled={withdrawing}
                          onClick={handleWithdraw}
                        >
                          {withdrawing ? "Withdrawing…" : "Withdraw request"}
                        </Button>
                        {withdrawError && (
                          <p role="alert" className="mt-2 text-sm text-red-700">
                            {withdrawError}
                          </p>
                        )}
                      </>
                    )}
                  </section>
                )}
                <SuggestedVenuesPanel
                  event={event}
                  hasActiveBooking={Boolean(activeBooking) && activeBooking?.status !== "expired"}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </RoleGate>
  );
}
