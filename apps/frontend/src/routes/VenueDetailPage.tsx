import { formatOperatingHours, hasPermission } from "@spm/shared";
import { ArrowLeft, CalendarClock, Ban } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";

import { Button, buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { loadEventDetail, type EventDetail } from "@/features/event-requests/services/event-details";
import { getActiveVenueBooking, submitVenueBookingRequest } from "@/features/venues/services/venue-bookings";
import { searchAvailableVenues } from "@/features/venues/services/venue-search";
import { eventSearchDefaults } from "@/features/venues/components/manual-venue-search";
import {
  getVenue,
  VENUE_AVAILABILITY_LABELS,
  type VenueAvailabilityStatus,
  type VenueDetail,
} from "@/features/venues/services/venues";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

const dateTimeFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

/**
 * Read-only view of a venue catalogue entry — the entry point from the venue
 * list card, and also (with a ?forEvent=<eventId> query param) the "view
 * full details before requesting" step of SuggestedVenuesPanel's flow: a
 * coordinator lands here from "View details" on a suggested venue, reviews
 * everything, then confirms with the "Request this venue" action below
 * rather than that being a single click on the suggestions list itself.
 */
export function VenueDetailPage() {
  const { venueId } = useParams();
  const [searchParams] = useSearchParams();
  const forEventId = searchParams.get("forEvent");
  const exploreOnly = searchParams.get("explore") === "1";
  const fromSearch = searchParams.get("fromSearch") === "1";
  // Carried over from SuggestedVenuesPanel's own availability tag — a UX
  // convenience only, not a security boundary: submitVenueBookingRequest
  // re-validates everything server-side regardless of what's passed here.
  const statusParam = searchParams.get("status");
  const availabilityStatus =
    statusParam && statusParam in VENUE_AVAILABILITY_LABELS
      ? (statusParam as VenueAvailabilityStatus)
      : null;
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, user } = useAuth();
  const [venue, setVenue] = useState<VenueDetail>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [forEvent, setForEvent] = useState<EventDetail>();
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string>();
  const [availabilityChecked, setAvailabilityChecked] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [activeBooking, setActiveBooking] = useState(false);
  const canManageVenues = hasPermission(profile?.role ?? "attendee", "manageVenue");
  const canRequestVenue = Boolean(forEventId) && profile?.role === "event_coordinator"
    && forEvent?.assignedCoordinatorId === user?.id;
  const isBookable = availabilityChecked && !availabilityError && !exploreOnly && !activeBooking;
  const preferredLocation = forEvent?.venue.preferredLocation?.trim();
  const differsFromPreferredLocation = Boolean(preferredLocation && venue
    && !venue.location.toLocaleLowerCase().includes(preferredLocation.toLocaleLowerCase()));

  usePageTitle(venue?.name ?? "Venue details");

  useEffect(() => {
    if (!venueId) return;
    let active = true;
    setLoading(true);
    getVenue(venueId)
      .then((detail) => {
        if (active) setVenue(detail);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "This venue is unavailable or you do not have access to it.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [venueId]);

  useEffect(() => {
    if (!forEventId || !venueId) return;
    let active = true;
    setAvailabilityChecked(false);
    Promise.all([loadEventDetail(forEventId), getActiveVenueBooking(forEventId)])
      .then(async ([detail, booking]) => {
        if (!active) return;
        setForEvent(detail);
        setActiveBooking(Boolean(booking));
        if (detail.status !== "planning" || !detail.startsAt || !detail.endsAt) {
          setAvailabilityError("This event is not ready for a venue request.");
          return;
        }
        const defaults = eventSearchDefaults(detail);
        const available = await searchAvailableVenues(forEventId, {
          ...defaults, location: "", layout: "", facilities: [], accessibility: "",
        });
        if (active) {
          setAvailabilityChecked(available.some((candidate) => candidate.id === venueId));
          setAvailabilityError(available.some((candidate) => candidate.id === venueId)
            ? "" : "This venue is not available or suitable for the event's saved schedule.");
        }
      })
      .catch(() => {
        if (active) setAvailabilityError("Availability could not be verified. Return to the event and try again.");
      });

    return () => {
      active = false;
    };
  }, [forEventId, venueId]);

  async function handleRequestVenue() {
    if (!forEventId || !venueId) return;
    setRequesting(true);
    setRequestError(undefined);
    try {
      await submitVenueBookingRequest(forEventId, venueId);
      navigate(`/events/${forEventId}/venue`);
    } catch (submitError) {
      setRequestError(
        submitError instanceof Error
          ? submitError.message
          : "This venue booking request could not be submitted.",
      );
      setRequesting(false);
    }
  }

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-4xl">
          <Link
            to={forEventId ? `/events/${forEventId}/venue` : "/venues"}
            state={location.state}
            className={buttonVariants({ variant: "ghost", className: "-ml-2" })}
          >
            <ArrowLeft /> {forEventId ? (fromSearch ? "Back to venue search" : "Back to venue suggestions") : "Back to venues"}
          </Link>

          {loading ? (
            <div className="mt-7 h-96 animate-pulse rounded-2xl bg-slate-200/70 motion-reduce:animate-none" />
          ) : error || !venue ? (
            <section className="mt-7 rounded-2xl border border-red-200 bg-red-50 p-6">
              <h1 className="font-semibold text-red-900">Venue unavailable</h1>
              <p role="alert" className="mt-2 text-sm text-red-800">
                {error ?? "This venue could not be found."}
              </p>
            </section>
          ) : (
            <div className="mt-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h1 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950">
                  {venue.name}
                </h1>
                <div className="flex flex-wrap gap-2">
                  {/* Visible to every role that can reach this page, not just
                      those who can manage the catalogue (canManageVenues) — the
                      calendar is a read view any authorised internal user needs. */}
                  <Link
                    to={`/venues/${venueId}/availability`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    <CalendarClock /> View availability
                  </Link>
                  {canManageVenues && (
                    <Link to={`/venues/${venueId}/blocks`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                      <Ban /> Manage blocks
                    </Link>
                  )}
                  {canManageVenues && (
                    <Link
                      to={`/venues/${venueId}/edit`}
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                        className: "border-primary/30 bg-accent text-primary hover:bg-accent/80",
                      })}
                    >
                      Edit venue
                    </Link>
                  )}
                </div>
              </div>
              {/* AC09: who last updated this entry, and when. */}
              <p className="mt-2 text-sm text-slate-500">
                Last updated {dateTimeFormatter.format(new Date(venue.updatedAt))}
                {venue.updatedByName && ` by ${venue.updatedByName}`}
              </p>

              <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
                <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">
                  Overview
                </h2>
                <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Location" value={venue.location} />
                  <Field label="Capacity" value={venue.capacity} />
                  <Field
                    label="Operating hours"
                    value={formatOperatingHours(venue.operatingHours)}
                  />
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium text-slate-400">Facilities</dt>
                    <dd className="mt-2 flex flex-wrap gap-1.5">
                      {venue.facilities.length > 0 ? (
                        venue.facilities.map((facility) => (
                          <span
                            key={facility}
                            className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700"
                          >
                            {facility}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-slate-500">None listed</span>
                      )}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium text-slate-400">Supported room layouts</dt>
                    <dd className="mt-2 flex flex-wrap gap-1.5">
                      {venue.layouts.length > 0 ? (
                        venue.layouts.map((layout) => (
                          <span
                            key={layout}
                            className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700"
                          >
                            {layout}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-slate-500">None listed</span>
                      )}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium text-slate-400">Description</dt>
                    <dd className="mt-1 text-sm whitespace-pre-wrap text-slate-800">
                      {venue.description || "Not provided"}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium text-slate-400">Accessibility notes</dt>
                    <dd className="mt-1 text-sm whitespace-pre-wrap text-slate-800">
                      {venue.accessibilityNotes || "Not provided"}
                    </dd>
                  </div>
                </dl>
              </section>

              {canRequestVenue && (
                <section
                  className={`mt-4 rounded-2xl border p-6 ${
                    isBookable ? "border-primary/30 bg-accent" : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <h2
                    className={`text-sm font-semibold tracking-wide uppercase ${
                      isBookable ? "text-primary" : "text-slate-500"
                    }`}
                  >
                    Request this venue
                  </h2>
                  <p className={`mt-2 text-sm ${isBookable ? "text-primary" : "text-slate-600"}`}>
                    {isBookable ? (
                      forEvent
                        ? `Review the details above, then confirm to request this venue for "${forEvent.title}".`
                        : "Review the details above, then confirm to submit the request."
                    ) : activeBooking ? "This event already has an active venue request. You can review venues, but cannot submit another request while it remains active." : exploreOnly ? "This result is for review only. If you searched another time, discuss a schedule change with the organiser before requesting a venue for that time." : availabilityError || (availabilityStatus && availabilityStatus !== "available" ? `This venue was marked ${VENUE_AVAILABILITY_LABELS[availabilityStatus]}.` : "Checking current availability…")}
                  </p>
                  {differsFromPreferredLocation && (
                    <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                      The organiser requested {preferredLocation}, but this venue is in {venue.location}. Check the alternative with the organiser before requesting it. If agreed, <Link to={`/events/${forEventId}/coordinator-edit`} className="font-semibold underline underline-offset-2 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">update the event’s venue requirements</Link>.
                    </p>
                  )}
                  {requestError && (
                    <p role="alert" className="mt-2 text-sm text-red-700">
                      {requestError}
                    </p>
                  )}
                  <div className="mt-4 flex gap-2">
                    {isBookable && (
                      <Button type="button" disabled={requesting} onClick={handleRequestVenue}>
                        {requesting ? "Requesting…" : "Request venue"}
                      </Button>
                    )}
                    <Link
                      to={`/events/${forEventId}/venue`}
                      state={location.state}
                      className={buttonVariants({ variant: "outline" })}
                    >
                      Cancel
                    </Link>
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </RoleGate>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm text-slate-800">{value || "Not provided"}</dd>
    </div>
  );
}
