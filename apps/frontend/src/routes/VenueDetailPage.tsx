import {
  formatOperatingHours, hasPermission, isLocationArea, singaporeLocalToIso,
  type VenueBookingDetails, type VenueSearchValues,
} from "@spm/shared";
import { ArrowLeft, Ban, Building2, CalendarClock, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";

import { Button, buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { loadEventDetail, type EventDetail } from "@/features/event-requests/services/event-details";
import { BookingActivityList } from "@/features/venues/components/booking-activity-list";
import {
  checkVenueBookingAvailability,
  getActiveVenueBooking,
  listVenueBookingsForVenue,
  requestReplacementVenue,
  submitVenueBookingRequest,
  type VenueBookingRequestSummary,
} from "@/features/venues/services/venue-bookings";
import { buildBookingActivity } from "@/features/venues/utils/booking-activity";
import { getVenueLayoutImage } from "@/features/venues/utils/venue-layout-image";
import {
  getVenue,
  listVenueBufferTimeChanges,
  recheckVenueConflicts,
  VENUE_AVAILABILITY_LABELS,
  type VenueAvailabilityStatus,
  type VenueBufferTimeChange,
  type VenueDetail,
} from "@/features/venues/services/venues";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";
import { venueDetailReturnState } from "@/features/venues/utils/venue-detail-navigation";

const dateTimeFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

const BUFFER_FIELD_LABELS: Record<VenueBufferTimeChange["field"], string> = {
  setup_time_minutes: "Setup time",
  turnaround_time_minutes: "Turnaround time",
};

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
  // SPM-82: set when the coordinator is choosing a replacement for a
  // disrupted booking. The request then replaces that booking instead of
  // being a new request, so the event's existing booking does not block it.
  const replacesBookingId = searchParams.get("replaces");
  // SPM-85: set when the coordinator is adding another venue (a breakout room);
  // the booking's own label, period, headcount and needs travel from the search.
  const isAdditional = searchParams.get("additional") === "1";
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
  const additionalState = location.state as { venueSearch?: VenueSearchValues; bookingLabel?: string } | null;
  const additionalDraft = isAdditional ? additionalState?.venueSearch : undefined;
  const additionalLabel = additionalState?.bookingLabel?.trim() ?? "";
  const additionalDetails: VenueBookingDetails | undefined =
    additionalDraft && additionalLabel
      ? {
          label: additionalLabel,
          startsAt: singaporeLocalToIso(additionalDraft.startsAt),
          endsAt: singaporeLocalToIso(additionalDraft.endsAt),
          expectedHeadcount: Number(additionalDraft.minimumCapacity),
          layoutNotes: additionalDraft.layout || undefined,
          accessibilityNotes: additionalDraft.accessibility.trim() || undefined,
          requiredFacilities: additionalDraft.facilities,
        }
      : undefined;
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
  const [bufferTimeChanges, setBufferTimeChanges] = useState<VenueBufferTimeChange[]>([]);
  // SPM-85: what happened to bookings at this venue, for Venue Staff.
  const [venueBookings, setVenueBookings] = useState<VenueBookingRequestSummary[]>([]);
  const [rechecking, setRechecking] = useState(false);
  const [recheckMessage, setRecheckMessage] = useState<string>();
  const canManageVenues = hasPermission(profile?.role ?? "attendee", "manageVenue");
  const canRequestVenue = Boolean(forEventId) && profile?.role === "event_coordinator"
    && forEvent?.assignedCoordinatorId === user?.id;
  const isBookable = availabilityChecked && !availabilityError && !exploreOnly && !activeBooking;
  const preferredLocation = forEvent?.venue.preferredLocation?.trim();
  const differsFromPreferredLocation = Boolean(!isAdditional && preferredLocation && venue
    && (isLocationArea(preferredLocation)
      ? !(venue.areaTags?.includes(preferredLocation) ||
          (!venue.areaTags?.length && venue.location.toLocaleLowerCase().includes(preferredLocation.toLocaleLowerCase())))
      : !venue.location.toLocaleLowerCase().includes(preferredLocation.toLocaleLowerCase())));

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
    if (!venueId || !canManageVenues) return;
    let active = true;
    listVenueBufferTimeChanges(venueId)
      .then((changes) => {
        if (active) setBufferTimeChanges(changes);
      })
      .catch(() => {
        // Non-critical — the Overview card's Setup/Turnaround fields still
        // render fine without a history log.
      });

    return () => {
      active = false;
    };
  }, [venueId, canManageVenues]);

  useEffect(() => {
    if (!venueId || !canManageVenues) return;
    let active = true;
    listVenueBookingsForVenue(venueId)
      .then((bookings) => {
        if (active) setVenueBookings(bookings);
      })
      .catch(() => {
        // Non-critical — the rest of the page works without the activity log.
      });

    return () => {
      active = false;
    };
  }, [venueId, canManageVenues]);

  // A notification can link straight to the Activity section (#activity).
  useEffect(() => {
    if (location.hash === "#activity" && venue) {
      document.getElementById("activity")?.scrollIntoView({ block: "start" });
    }
  }, [location.hash, venue, venueBookings.length]);

  useEffect(() => {
    if (!forEventId || !venueId) return;
    let active = true;
    setAvailabilityChecked(false);
    Promise.all([loadEventDetail(forEventId), getActiveVenueBooking(forEventId)])
      .then(async ([detail, booking]) => {
        if (!active) return;
        setForEvent(detail);
        // getActiveVenueBooking still returns a past-deadline On Hold row
        // (status computed as "expired" for display, per
        // effectiveBookingStatus) so it can be shown as such — it isn't
        // actually blocking anymore, so it must not count as "active" here.
        setActiveBooking(Boolean(booking) && booking?.status !== "expired" && !replacesBookingId && !isAdditional);
        // A replacement is also allowed for a Confirmed event (approving it
        // returns the event to Planning); a new request only for Planning.
        const requestableStatus =
          detail.status === "planning" || (Boolean(replacesBookingId) && detail.status === "confirmed");
        if (!requestableStatus || !detail.startsAt || !detail.endsAt) {
          setAvailabilityError("This event is not ready for a venue request.");
          return;
        }
        // Same function submitVenueBookingRequest/decideVenueBookingRequest
        // call internally, so this pre-check (including setup/turnaround)
        // and the server's real enforcement can never drift apart — and the
        // "Request venue" button stays disabled, with this exact reason
        // shown, until it's actually available.
        if (isAdditional) {
          if (!additionalDetails) {
            setAvailabilityError("Describe this booking first: choose Add another venue on the event's Venue page.");
            return;
          }
          if (venue && Number(venue.capacity) < additionalDetails.expectedHeadcount) {
            setAvailabilityError(
              `This venue's capacity (${venue.capacity}) is below this booking's expected headcount (${additionalDetails.expectedHeadcount}).`,
            );
            return;
          }
        }
        const availability = await checkVenueBookingAvailability(
          venueId,
          forEventId,
          isAdditional && additionalDetails
            ? { startsAt: additionalDetails.startsAt, endsAt: additionalDetails.endsAt }
            : undefined,
        );
        if (active) {
          setAvailabilityChecked(availability.available);
          setAvailabilityError(availability.available ? "" : (availability.reason ?? "This venue is not available for the event's saved schedule."));
        }
      })
      .catch(() => {
        if (active) setAvailabilityError("Availability could not be verified. Return to the event and try again.");
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forEventId, venueId, replacesBookingId, isAdditional, venue?.capacity]);

  async function handleRecheckConflicts() {
    if (!venueId) return;
    setRechecking(true);
    setRecheckMessage(undefined);
    try {
      const result = await recheckVenueConflicts(venueId);
      setRecheckMessage(
        result.activeCount === 0
          ? "No scheduling conflicts for this venue."
          : `${result.activeCount} conflict${result.activeCount === 1 ? "" : "s"} flagged for this venue. View them on the Flagged page.`,
      );
    } catch (recheckError) {
      setRecheckMessage(
        recheckError instanceof Error
          ? recheckError.message
          : "This venue's conflicts could not be re-checked.",
      );
    } finally {
      setRechecking(false);
    }
  }

  async function handleRequestVenue() {
    if (!forEventId || !venueId) return;
    setRequesting(true);
    setRequestError(undefined);
    try {
      if (replacesBookingId) {
        await requestReplacementVenue(replacesBookingId, venueId);
      } else {
        if (isAdditional && additionalDetails) {
          await submitVenueBookingRequest(forEventId, venueId, additionalDetails);
        } else {
          await submitVenueBookingRequest(forEventId, venueId);
        }
      }
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
          {forEventId ? (
            <Link
              to={`/events/${forEventId}/venue`}
              state={location.state}
              className={buttonVariants({ variant: "ghost", className: "-ml-2" })}
            >
              <ArrowLeft /> {fromSearch ? "Back to venue search" : "Back to venue suggestions"}
            </Link>
          ) : (
            // Use the saved catalogue URL: browser history may now point to
            // Manage blocks or availability instead of the catalogue.
            <button
              type="button"
              onClick={() => {
                const url = (location.state as { venueCatalogueUrl?: unknown } | null)?.venueCatalogueUrl;
                navigate(typeof url === "string" && (url === "/venues" || url.startsWith("/venues?")) ? url : "/venues");
              }}
              className={buttonVariants({ variant: "ghost", className: "-ml-2" })}
            >
              <ArrowLeft /> Back to venues
            </button>
          )}

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
              {(() => {
                const photo = venue.imageUrl || getVenueLayoutImage(venue.layouts);
                return photo ? (
                  <img
                    src={photo}
                    alt=""
                    aria-hidden="true"
                    className="h-56 w-full rounded-2xl object-cover sm:h-64"
                  />
                ) : (
                  <div className="grid h-56 w-full place-items-center rounded-2xl bg-accent sm:h-64">
                    <Building2 className="size-10 text-primary" aria-hidden="true" />
                  </div>
                );
              })()}
              <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
                <h1 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950">
                  {venue.name}
                </h1>
                <div className="flex flex-wrap gap-2">
                  {/* Visible to every role that can reach this page, not just
                      those who can manage the catalogue (canManageVenues) — the
                      calendar is a read view any authorised internal user needs. */}
                  <Link
                    to={`/venues/${venueId}/availability`}
                    state={{ ...location.state, ...venueDetailReturnState(location.pathname, location.search) }}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    <CalendarClock /> View availability
                  </Link>
                  {canManageVenues && (
                    <Link to={`/venues/${venueId}/blocks`} state={location.state} className={buttonVariants({ variant: "outline", size: "sm" })}>
                      <Ban /> Manage blocks
                    </Link>
                  )}
                  {canManageVenues && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={rechecking}
                      onClick={handleRecheckConflicts}
                    >
                      <RefreshCw /> {rechecking ? "Re-checking…" : "Re-check conflicts"}
                    </Button>
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
              {recheckMessage && (
                <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  {recheckMessage}
                </p>
              )}

              <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
                <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">
                  Overview
                </h2>
                <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Location" value={venue.areaTags?.[0] ?? venue.location} />
                  {venue.areaTags?.[0] && venue.location && venue.location !== venue.areaTags[0] && (
                    <Field label="Address" value={venue.location} />
                  )}
                  <Field label="Capacity" value={venue.capacity} />
                  {/* Wrapped in its own row, spanning both columns, so Setup
                      and Turnaround always stay paired regardless of how
                      many fields (Location, Address, Capacity) precede them —
                      Address is conditional, so its presence would otherwise
                      shift this pair out of alignment. */}
                  <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
                    <div className="rounded-lg bg-accent px-3.5 py-2.5">
                      <dt className="text-xs font-medium text-primary">Setup time</dt>
                      <dd className="mt-1 text-sm font-semibold text-slate-900">
                        {venue.setupTimeMinutes} min
                      </dd>
                    </div>
                    <div className="rounded-lg bg-accent px-3.5 py-2.5">
                      <dt className="text-xs font-medium text-primary">Turnaround time</dt>
                      <dd className="mt-1 text-sm font-semibold text-slate-900">
                        {venue.turnaroundTimeMinutes} min
                      </dd>
                    </div>
                  </div>
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

              {/* AC: Venue Staff can see the setup/turnaround change log —
                  inline here rather than a separate route (unlike
                  EventHistoryPage), since a venue's buffer edits are a
                  short, low-volume log, not the multi-stage history an
                  event accumulates. RLS only lets venue_staff read
                  venue_buffer_time_changes anyway, so gating the section on
                  canManageVenues matches what the query would return. */}
              {canManageVenues && (
                <section
                  id="activity"
                  aria-label="Activity"
                  className="mt-6 scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6"
                >
                  <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">
                    Activity
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Bookings at this venue, newest first: requested, approved, rejected, withdrawn or cancelled, with the reasons given.
                  </p>
                  <div className="mt-4">
                    <BookingActivityList
                      entries={buildBookingActivity(venueBookings)}
                      showEvent
                      emptyText="No bookings have been requested at this venue yet."
                    />
                  </div>
                </section>
              )}

              {canManageVenues && (
                <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
                  <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">
                    Setup and turnaround time history
                  </h2>
                  {bufferTimeChanges.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-500">
                      No setup or turnaround time changes recorded yet.
                    </p>
                  ) : (
                    <ol className="mt-4 space-y-2">
                      {bufferTimeChanges.map((change) => (
                        <li
                          key={change.id}
                          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-sm"
                        >
                          <span className="text-slate-800">
                            {BUFFER_FIELD_LABELS[change.field]} changed{" "}
                            <span className="text-slate-400">{change.previousValue} min →</span>{" "}
                            <b>{change.newValue} min</b>
                          </span>
                          <span className="text-xs text-slate-500">
                            {change.changedByName ?? "Unknown"} ·{" "}
                            {dateTimeFormatter.format(new Date(change.changedAt))}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              )}

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
                    {replacesBookingId
                      ? "Request this venue as a replacement"
                      : isAdditional && additionalLabel
                        ? `Request this venue as ${additionalLabel}`
                        : "Request this venue"}
                  </h2>
                  <p className={`mt-2 text-sm ${isBookable ? "text-primary" : "text-slate-600"}`}>
                    {isBookable ? (
                      forEvent
                        ? isAdditional && additionalDetails
                          ? `Review the details above, then confirm to request this venue as "${additionalDetails.label}" for "${forEvent.title}": ${dateTimeFormatter.format(new Date(additionalDetails.startsAt))} – ${dateTimeFormatter.format(new Date(additionalDetails.endsAt))}, ${additionalDetails.expectedHeadcount} people. It is decided separately from the event's other venues.`
                          : replacesBookingId
                          ? `Review the details above, then confirm to request this venue as the replacement for the disrupted booking of "${forEvent.title}". It keeps the same period.`
                          : `Review the details above, then confirm to request this venue for "${forEvent.title}".`
                        : "Review the details above, then confirm to submit the request."
                    ) : activeBooking ? "This event already has an active venue request. You can review venues, but cannot submit another request while it remains active." : exploreOnly ? "This result is for review only. If you searched another time, discuss a schedule change with the organiser before requesting a venue for that time." : availabilityError || (availabilityStatus && availabilityStatus !== "available" ? `This venue was marked ${VENUE_AVAILABILITY_LABELS[availabilityStatus]}.` : "Checking current availability…")}
                  </p>
                  {differsFromPreferredLocation && (
                    <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                      The organiser requested {preferredLocation}, but this venue is in {venue.areaTags?.[0] ?? venue.location}. Check the alternative with the organiser before requesting it. If agreed, <Link to={`/events/${forEventId}/coordinator-edit`} className="font-semibold underline underline-offset-2 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">update the event’s venue requirements</Link>.
                    </p>
                  )}
                  {requestError && (
                    <p role="alert" className="mt-2 text-sm text-red-700">
                      {requestError}
                    </p>
                  )}
                  <div className="mt-4 flex gap-2">
                    <Button type="button" disabled={!isBookable || requesting} onClick={handleRequestVenue}>
                      {requesting ? "Requesting…" : replacesBookingId ? "Request replacement" : isAdditional ? "Request additional venue" : "Request venue"}
                    </Button>
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
