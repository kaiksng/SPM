import { getRoleDestination } from "@spm/shared";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/context/auth-context";
import { loadEventDetail, type EventDetail } from "@/features/event-requests/services/event-details";
import {
  getActiveVenueBooking,
  listVenues,
  submitVenueBookingRequest,
  withdrawVenueBookingRequest,
  type Venue,
  type VenueBooking,
  type VenueBookingStatus,
} from "@/features/event-requests/services/venue-bookings";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

const dateTimeFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

/**
 * SPM-24: the Coordinator's "submit a venue booking request" flow, reached
 * from the "Venue" sub-item under Planning in EventDetailPage's lifecycle
 * sidebar. AC04 means an event has at most one active (Pending/Confirmed)
 * request at a time, so this page shows either that one request (with a
 * Withdraw action while it's Pending) or the submission form — never both.
 */
export function VenueBookingRequestPage() {
  const { eventId } = useParams();
  const { profile } = useAuth();
  const [event, setEvent] = useState<EventDetail>();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [activeBooking, setActiveBooking] = useState<VenueBooking | null>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();

  const [venueId, setVenueId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [submitError, setSubmitError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string>();

  usePageTitle("Venue booking request");

  const authorised = profile?.role === "event_coordinator" || profile?.role === "administrator";

  useEffect(() => {
    if (!eventId || !authorised) return;
    let active = true;
    setLoading(true);
    Promise.all([loadEventDetail(eventId), listVenues(), getActiveVenueBooking(eventId)])
      .then(([eventDetail, venueRows, booking]) => {
        if (!active) return;
        setEvent(eventDetail);
        setVenues(venueRows);
        setActiveBooking(booking);
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "This event is unavailable, not in Planning, or you do not have access to it.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [eventId, authorised]);

  async function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (!eventId) return;
    setSubmitError(undefined);
    setSubmitting(true);
    try {
      await submitVenueBookingRequest(
        eventId,
        venueId,
        new Date(startsAt).toISOString(),
        new Date(endsAt).toISOString(),
      );
      setActiveBooking(await getActiveVenueBooking(eventId));
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "This venue booking request could not be submitted.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleWithdraw() {
    if (!activeBooking) return;
    setWithdrawError(undefined);
    setWithdrawing(true);
    try {
      await withdrawVenueBookingRequest(activeBooking.id);
      setActiveBooking(eventId ? await getActiveVenueBooking(eventId) : null);
    } catch (error) {
      setWithdrawError(
        error instanceof Error ? error.message : "This venue booking request could not be withdrawn.",
      );
    } finally {
      setWithdrawing(false);
    }
  }

  if (!authorised) {
    return (
      <RoleGate>
        <div className="grid min-h-[70vh] place-items-center bg-slate-50 px-6 text-center">
          <div>
            <p className="text-sm font-semibold text-red-700">Access denied</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-950">
              Event Coordinator access is required
            </h1>
            <Link
              to={profile ? getRoleDestination(profile.role) : "/login"}
              className={buttonVariants({ variant: "outline", className: "mt-6" })}
            >
              Return to your workspace
            </Link>
          </div>
        </div>
      </RoleGate>
    );
  }

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-3xl">
          <Link
            to={eventId ? `/events/${eventId}` : "/events"}
            className={buttonVariants({ variant: "ghost", className: "-ml-2" })}
          >
            <ArrowLeft /> Back to event
          </Link>

          <header className="mt-6 border-b border-slate-200 pb-7">
            <h1 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950">
              Venue booking request
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              {event ? `For "${event.title}"` : "Loading event…"}
            </p>
          </header>

          {loading ? (
            <div className="mt-7 h-64 animate-pulse rounded-2xl bg-slate-200/70 motion-reduce:animate-none" />
          ) : loadError || !event ? (
            <section className="mt-7 rounded-2xl border border-red-200 bg-red-50 p-6">
              <h2 className="font-semibold text-red-900">Event unavailable</h2>
              <p role="alert" className="mt-2 text-sm text-red-800">
                {loadError ?? "This event could not be found."}
              </p>
            </section>
          ) : (
            <div className="mt-7 space-y-6">
              <section className="rounded-2xl border border-slate-200 bg-white p-6">
                <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">
                  What Venue Staff will assess
                </h2>
                <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium text-slate-400">Expected attendance</dt>
                    <dd className="mt-1 text-sm text-slate-800">
                      {event.expectedAttendance ?? "Not provided"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-400">Preferred location</dt>
                    <dd className="mt-1 text-sm text-slate-800">
                      {event.venue.preferredLocation || "Not provided"}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium text-slate-400">Accessibility notes</dt>
                    <dd className="mt-1 text-sm text-slate-800">
                      {event.venue.accessibilityNotes || "Not provided"}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium text-slate-400">Layout notes</dt>
                    <dd className="mt-1 text-sm text-slate-800">
                      {event.venue.layoutNotes || "Not provided"}
                    </dd>
                  </div>
                </dl>
              </section>

              {activeBooking ? (
                <section className="rounded-2xl border border-slate-200 bg-white p-6">
                  <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">
                    Current request
                  </h2>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <VenueBookingStatusBadge status={activeBooking.status} />
                    <span className="text-sm font-medium text-slate-800">{activeBooking.venueName}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {dateTimeFormatter.format(new Date(activeBooking.startsAt))}
                    {" – "}
                    {dateTimeFormatter.format(new Date(activeBooking.endsAt))}
                  </p>
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
              ) : (
                <section className="rounded-2xl border border-slate-200 bg-white p-6">
                  <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">
                    Submit a request
                  </h2>
                  <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="venue">Venue</Label>
                      <Select
                        value={venueId}
                        onValueChange={(value) => setVenueId(value ?? "")}
                        required
                      >
                        <SelectTrigger id="venue">
                          <SelectValue placeholder="Choose a venue" />
                        </SelectTrigger>
                        <SelectContent>
                          {venues.map((venue) => (
                            <SelectItem key={venue.id} value={venue.id}>
                              {venue.name} (capacity {venue.capacity})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="startsAt">Starts</Label>
                        <Input
                          id="startsAt"
                          type="datetime-local"
                          value={startsAt}
                          onChange={(event) => setStartsAt(event.target.value)}
                          required
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="endsAt">Ends</Label>
                        <Input
                          id="endsAt"
                          type="datetime-local"
                          value={endsAt}
                          onChange={(event) => setEndsAt(event.target.value)}
                          required
                        />
                      </div>
                    </div>
                    {submitError && (
                      <p role="alert" className="text-sm text-red-700">
                        {submitError}
                      </p>
                    )}
                    <Button type="submit" disabled={submitting}>
                      {submitting ? "Submitting…" : "Submit request"}
                    </Button>
                  </form>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </RoleGate>
  );
}

const VENUE_BOOKING_STATUS_CLASSES: Record<VenueBookingStatus, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  confirmed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-red-200 bg-red-50 text-red-700",
  withdrawn: "border-slate-200 bg-slate-100 text-slate-500",
};

function VenueBookingStatusBadge({ status }: { status: VenueBookingStatus }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${VENUE_BOOKING_STATUS_CLASSES[status]}`}
    >
      {status}
    </span>
  );
}
