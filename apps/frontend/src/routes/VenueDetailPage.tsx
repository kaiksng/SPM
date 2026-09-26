import { formatOperatingHours, hasPermission } from "@spm/shared";
import { ArrowLeft, CalendarClock } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";

import { Button, buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { loadEventDetail, type EventDetail } from "@/features/event-requests/services/event-details";
import { submitVenueBookingRequest } from "@/features/venues/services/venue-bookings";
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
  // Carried over from SuggestedVenuesPanel's own availability tag — a UX
  // convenience only, not a security boundary: submitVenueBookingRequest
  // re-validates everything server-side regardless of what's passed here.
  const statusParam = searchParams.get("status");
  const availabilityStatus =
    statusParam && statusParam in VENUE_AVAILABILITY_LABELS
      ? (statusParam as VenueAvailabilityStatus)
      : null;
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [venue, setVenue] = useState<VenueDetail>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [forEvent, setForEvent] = useState<EventDetail>();
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string>();
  const canManageVenues = hasPermission(profile?.role ?? "attendee", "manageVenue");
  const canRequestVenue = Boolean(forEventId) && profile?.role === "event_coordinator";
  // Missing/unrecognised status (e.g. a direct link) defaults to bookable —
  // only a known non-available status disables the action.
  const isBookable = availabilityStatus === null || availabilityStatus === "available";

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
    if (!forEventId) return;
    let active = true;
    loadEventDetail(forEventId)
      .then((detail) => {
        if (active) setForEvent(detail);
      })
      .catch(() => {
        // Non-fatal — the request button still works without the event's
        // title to display, since submitVenueBookingRequest re-validates
        // everything server-side regardless.
      });

    return () => {
      active = false;
    };
  }, [forEventId]);

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
            className={buttonVariants({ variant: "ghost", className: "-ml-2" })}
          >
            <ArrowLeft /> {forEventId ? "Back to venue suggestions" : "Back to venues"}
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
                    <Link
                      to={`/venues/${venueId}/edit`}
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                        className: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
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
                    <dt className="text-xs font-medium text-slate-400">Supported room layout</dt>
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
                    isBookable ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <h2
                    className={`text-sm font-semibold tracking-wide uppercase ${
                      isBookable ? "text-blue-700" : "text-slate-500"
                    }`}
                  >
                    Request this venue
                  </h2>
                  <p className={`mt-2 text-sm ${isBookable ? "text-blue-900" : "text-slate-600"}`}>
                    {isBookable ? (
                      forEvent
                        ? `Review the details above, then confirm to request this venue for "${forEvent.title}".`
                        : "Review the details above, then confirm to submit the request."
                    ) : (
                      <>
                        This venue already has a {VENUE_AVAILABILITY_LABELS[availabilityStatus!]}{" "}
                        {availabilityStatus === "blocked" ? "block" : "booking"} that overlaps this
                        event&apos;s schedule. Shown for reference only — choose an Available venue
                        to submit a request.
                      </>
                    )}
                  </p>
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
