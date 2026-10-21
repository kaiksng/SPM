import {
  clarificationPermittedFieldLabels,
  isDirectEditBlocked,
  type ClarificationPermittedField,
  type EventReadiness,
} from "@spm/shared";
import { CalendarDays } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { Button, buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { ChangeRequestPanel } from "@/features/event-requests/components/change-request-panel";
import { ClarificationPanel } from "@/features/event-requests/components/clarification-panel";
import { ConfirmedArrangementsSection } from "@/features/event-requests/components/confirmed-arrangements-section";
import { EventPageTopBar } from "@/features/event-requests/components/event-page-top-bar";
import { EventPlanningTimeline } from "@/features/event-requests/components/event-planning-timeline";
import { EventStatusBadge, StatusBadge } from "@/features/event-requests/components/status-badges";
import { EventStatusTimeline } from "@/features/event-requests/components/status-timeline";
import { VenueFacilitiesSection } from "@/features/event-requests/components/venue-facilities-section";
import type { ClarificationSummary } from "@/features/event-requests/services/clarifications";
import {
  loadEventDetail,
  type EventDetail,
} from "@/features/event-requests/services/event-details";
import { completeEvent } from "@/features/event-requests/services/event-lifecycle";
import { loadEventReadiness } from "@/features/safety-check/services/event-readiness";
import {
  listVenueBookingsForEvent,
  type VenueBookingRequestSummary,
} from "@/features/venues/services/venue-bookings";
import { usePageTitle } from "@/hooks/use-page-title";
import { cn } from "@/lib/utils";
import { RoleGate } from "@/routes/RoleGate";

const dateTimeFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

function formatDateTime(value: string | null) {
  return value ? dateTimeFormatter.format(new Date(value)) : "Not set";
}

/**
 * A read-only view of an event for whoever can see it (organiser, the
 * assigned coordinator, or an Event Coordinator Lead) — the coordinator's
 * counterpart to the organiser's "Edit request" page, which already doubles
 * as their own full-detail view. The Lead's view is strictly read-only: no
 * edit/complete actions and no clarification panel (mutating actions only
 * the organiser or assigned coordinator may take) — the Lead sees history
 * via the top bar's Change history link/EventHistoryPage instead.
 */
export function EventDetailPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const [event, setEvent] = useState<EventDetail>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [reviewState, setReviewState] = useState<"open" | "answered">();
  const [unresolvedClarification, setUnresolvedClarification] =
    useState<ClarificationSummary>();
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string>();
  const [venueBookings, setVenueBookings] = useState<VenueBookingRequestSummary[]>();
  const [readiness, setReadiness] = useState<EventReadiness>();

  usePageTitle(event?.title ?? "Event details");

  useEffect(() => {
    if (!eventId) return;
    let active = true;
    setLoading(true);
    loadEventDetail(eventId)
      .then((detail) => {
        if (active) setEvent(detail);
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

  const role =
    profile?.role === "event_organiser"
      ? "organiser"
      : profile?.role === "event_coordinator_lead"
        ? "lead"
        : "coordinator";
  // SPM-09 AC02: "authorised coordinator" means the one coordinator assigned
  // to this specific event — a coordinator who isn't assigned sees the same
  // denial as an event they can't load at all.
  const isUnassignedCoordinator =
    !!event && profile?.role === "event_coordinator" && event.assignedCoordinatorId !== user?.id;
  // SPM: an organiser sees their own Confirmed event's agreed arrangements —
  // belt-and-braces alongside can_view_event RLS, same reasoning as
  // isUnassignedCoordinator above.
  const canViewConfirmedArrangements =
    !!event && role === "organiser" && event.organiserId === user?.id && event.status === "confirmed";

  useEffect(() => {
    if (!event || !canViewConfirmedArrangements) return;
    let active = true;
    Promise.all([listVenueBookingsForEvent(event.id), loadEventReadiness(event.id)])
      .then(([bookings, eventReadiness]) => {
        if (active) {
          setVenueBookings(bookings);
          setReadiness(eventReadiness);
        }
      })
      .catch(() => {
        // Left undefined: the section simply doesn't render rather than
        // showing a second error banner alongside the page's own.
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the event's id, not the whole object, so handleComplete's setEvent doesn't retrigger this fetch.
  }, [event?.id, canViewConfirmedArrangements]);

  async function handleComplete() {
    if (!event) return;
    setCompleting(true);
    setCompleteError(undefined);
    try {
      await completeEvent(event.id);
      setEvent({ ...event, status: "completed" });
    } catch (completeErr) {
      setCompleteError(
        completeErr instanceof Error
          ? completeErr.message
          : "This event could not be marked completed.",
      );
    } finally {
      setCompleting(false);
    }
  }

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className={cn("mx-auto", role === "coordinator" ? "max-w-5xl" : "max-w-4xl")}>
          <EventPageTopBar backTo="/events" backLabel="Back to events" eventId={eventId} useHistoryBack />

          {loading ? (
            <div className="mt-7 h-96 animate-pulse rounded-2xl bg-slate-200/70 motion-reduce:animate-none" />
          ) : error || !event ? (
            <section className="mt-7 rounded-2xl border border-red-200 bg-red-50 p-6">
              <h1 className="font-semibold text-red-900">Event unavailable</h1>
              <p role="alert" className="mt-2 text-sm text-red-800">
                {error ?? "This event could not be found."}
              </p>
            </section>
          ) : isUnassignedCoordinator ? (
            <section className="mt-7 rounded-2xl border border-red-200 bg-red-50 p-6">
              <h1 className="font-semibold text-red-900">Event unavailable</h1>
              <p role="alert" className="mt-2 text-sm text-red-800">
                This event is unavailable or you do not have access to it.
              </p>
            </section>
          ) : (
            <div className="mt-6 lg:flex lg:items-start lg:gap-10">
              {role === "coordinator" && (
                <div className="mb-6 lg:mb-0 lg:sticky lg:top-24">
                  <EventPlanningTimeline status={event.status} eventId={event.id} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {role === "lead" ? (
                    <StatusBadge status={event.status} />
                  ) : (
                    <EventStatusBadge
                      status={event.status}
                      reviewState={reviewState === "open" ? "open" : undefined}
                      role={role}
                    />
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
                  <h1 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950">
                    {event.title}
                  </h1>
                  {role === "coordinator" && event.status === "planning" && (
                    <Link
                      to={`/events/${event.id}/coordinator-edit`}
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                        className: "border-primary/30 bg-accent text-primary hover:bg-accent/80",
                      })}
                    >
                      Edit event
                    </Link>
                  )}
                  {role === "coordinator" && event.status === "confirmed" && (
                    <Button size="sm" disabled={completing} onClick={handleComplete}>
                      {completing ? "Marking completed…" : "Mark as completed"}
                    </Button>
                  )}
                </div>
                {completeError && (
                  <p role="alert" className="mt-2 text-sm text-red-700">
                    {completeError}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500">
                  {event.organiserName && <span>Organiser: {event.organiserName}</span>}
                  {event.assignedCoordinatorName ? (
                    <span>Coordinator: {event.assignedCoordinatorName}</span>
                  ) : (
                    event.status === "requested" && <span>Awaiting coordinator assignment</span>
                  )}
                  {event.submittedAt && (
                    <span>Submitted {formatDateTime(event.submittedAt)}</span>
                  )}
                </div>
                <EventStatusTimeline eventId={event.id} />
                {isDirectEditBlocked(event.status) && (
                  <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    This event is finalised. Direct edits are locked to keep finalised arrangements
                    accurate — submit a change request instead of editing it directly.
                  </p>
                )}
                {role === "coordinator" &&
                  reviewState === "answered" &&
                  unresolvedClarification &&
                  unresolvedClarification.permittedFields.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <span className="text-xs font-medium text-amber-800">Edited:</span>
                      {unresolvedClarification.permittedFields.map((field) => (
                        <span
                          key={field}
                          className="rounded-full bg-amber-200 px-2.5 py-0.5 text-xs font-semibold text-amber-900"
                        >
                          {clarificationPermittedFieldLabels[
                            field as ClarificationPermittedField
                          ] ?? field}
                        </span>
                      ))}
                    </div>
                  )}
  
                <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
                  <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">
                    Overview
                  </h2>
                  <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Field label="Purpose" value={event.purpose} />
                    <Field label="Event type" value={event.eventType} />
                    <Field
                      label="Expected attendance"
                      value={event.expectedAttendance?.toString() ?? null}
                    />
                    <div>
                      <dt className="text-xs font-medium text-slate-400">Schedule</dt>
                      <dd className="mt-1 flex items-center gap-2 text-sm text-slate-800">
                        <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
                        {event.startsAt ? formatDateTime(event.startsAt) : "Not set"}
                        {" – "}
                        {event.endsAt ? formatDateTime(event.endsAt) : "Not set"}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs font-medium text-slate-400">Description</dt>
                      <dd className="mt-1 text-sm whitespace-pre-wrap text-slate-800">
                        {event.description || "Not provided"}
                      </dd>
                    </div>
                  </dl>
                </section>
  
                <VenueFacilitiesSection
                  event={event}
                  canEdit={role === "coordinator" && event.status === "planning"}
                  onSaved={(venue) => setEvent({ ...event, venue })}
                />

                <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
                  <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">
                    Registration
                  </h2>
                  {event.registration.required ? (
                    <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                      <Field label="Opens" value={formatDateTime(event.registration.opensAt)} />
                      <Field label="Closes" value={formatDateTime(event.registration.closesAt)} />
                      <Field
                        label="Capacity"
                        value={event.registration.capacity?.toString() ?? null}
                      />
                      <Field
                        label="Waitlist"
                        value={event.registration.waitlistEnabled ? "Enabled" : "Disabled"}
                      />
                    </dl>
                  ) : (
                    <p className="mt-4 text-sm text-slate-500">Registration is not required</p>
                  )}
                </section>

                {canViewConfirmedArrangements && venueBookings && readiness && (
                  <ConfirmedArrangementsSection
                    event={event}
                    bookings={venueBookings}
                    readiness={readiness}
                  />
                )}

                {role !== "lead" && (
                  <ClarificationPanel
                    eventId={event.id}
                    eventStatus={event.status}
                    role={role}
                    onReviewStateChange={setReviewState}
                    onUnresolvedChange={setUnresolvedClarification}
                    onDecided={(decision) =>
                      navigate("/events", {
                        replace: true,
                        state: {
                          notice:
                            decision === "approved"
                              ? "Event approved — now in planning."
                              : "Event rejected.",
                        },
                      })
                    }
                    className="mt-6 text-sm"
                  />
                )}
                {/* SPM-38: unlike ClarificationPanel, a Lead sees this when
                    the event has no assigned coordinator yet — that's the one
                    case a Lead decides a change request directly (AC06). */}
                {(role !== "lead" || !event.assignedCoordinatorId) && (
                  <ChangeRequestPanel
                    eventId={event.id}
                    eventStatus={event.status}
                    role={role}
                    isEventAssigned={!!event.assignedCoordinatorId}
                    className="mt-6 text-sm"
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

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm text-slate-800">{value || "Not provided"}</dd>
    </div>
  );
}
