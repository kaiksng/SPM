import {
  clarificationPermittedFieldLabels,
  isDirectEditBlocked,
  type ClarificationPermittedField,
  type EventReadiness,
} from "@spm/shared";
import { CalendarDays } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router";

import { Button, buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { CancelEventDialog } from "@/features/event-requests/components/cancel-event-dialog";
import { CompleteEventDialog } from "@/features/event-requests/components/complete-event-dialog";
import { ChangeRequestPanel } from "@/features/event-requests/components/change-request-panel";
import { ClarificationPanel } from "@/features/event-requests/components/clarification-panel";
import { ConfirmedArrangementsSection } from "@/features/event-requests/components/confirmed-arrangements-section";
import { EventPageTopBar } from "@/features/event-requests/components/event-page-top-bar";
import { EventPlanningTimeline } from "@/features/event-requests/components/event-planning-timeline";
import { EventStatusBadge, StatusBadge } from "@/features/event-requests/components/status-badges";
import { EventStatusTimeline } from "@/features/event-requests/components/status-timeline";
import { EventBannerSection } from "@/features/event-banners/components/event-banner-section";
import { EventDocumentsSection } from "@/features/event-documents/components/event-documents-section";
import { VenueFacilitiesSection } from "@/features/event-requests/components/venue-facilities-section";
import { SafetyPlanSummary } from "@/features/safety-check/components/safety-plan-summary";
import type { ClarificationSummary } from "@/features/event-requests/services/clarifications";
import { cancelEvent } from "@/features/event-requests/services/event-cancellation";
import {
  loadEventDetail,
  type EventDetail,
} from "@/features/event-requests/services/event-details";
import {
  completeEvent,
  loadEventCompletionAvailableAt,
} from "@/features/event-requests/services/event-lifecycle";
import { RegistrationSettingsSection } from "@/features/registrations/components/registration-settings-section";
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
  const location = useLocation();
  const { profile, user } = useAuth();
  // A page that sends the user back here (e.g. CoordinatorEventEditPage)
  // passes its confirmation as router state.
  const [notice, setNotice] = useState<string | undefined>(
    (location.state as { notice?: string } | null)?.notice,
  );
  const [event, setEvent] = useState<EventDetail>();
  // A registration notification links straight to the Registration section.
  const eventLoaded = Boolean(event);
  useEffect(() => {
    if (location.hash === "#registration" && eventLoaded) {
      document.getElementById("registration")?.scrollIntoView?.({ block: "start" });
    }
  }, [location.hash, eventLoaded]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [reviewState, setReviewState] = useState<"open" | "answered">();
  const [unresolvedClarification, setUnresolvedClarification] =
    useState<ClarificationSummary>();
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [completionAvailableAt, setCompletionAvailableAt] = useState<string>();
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
  // isUnassignedCoordinator above. SPM-46 AC05: still there once Completed.
  const canViewConfirmedArrangements =
    !!event &&
    role === "organiser" &&
    event.organiserId === user?.id &&
    (event.status === "confirmed" || event.status === "completed");
  const canComplete =
    !!event && role === "coordinator" && !isUnassignedCoordinator && event.status === "confirmed";
  // SPM-46 AC02: until the end time plus turnaround the button stays
  // disabled. If the time can't be loaded the button stays enabled and
  // complete_event's own check is the fallback.
  const completionNotYetAllowed =
    !!completionAvailableAt && Date.now() < new Date(completionAvailableAt).getTime();

  useEffect(() => {
    if (!event || !canComplete) return;
    let active = true;
    loadEventCompletionAvailableAt(event.id)
      .then((availableAt) => {
        if (active) setCompletionAvailableAt(availableAt);
      })
      .catch(() => {
        // Left undefined: see completionNotYetAllowed.
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the event's id, as the arrangements fetch below.
  }, [event?.id, canComplete]);

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

  // The dialog shows any error itself, so this one lets it through.
  async function handleComplete() {
    if (!event) return;
    await completeEvent(event.id);
    setEvent({ ...event, status: "completed" });
    setShowCompleteDialog(false);
  }

  async function handleCancel(reason: string) {
    if (!event) return;
    await cancelEvent(event.id, reason);
    setEvent({ ...event, status: "cancelled" });
    setShowCancelDialog(false);
  }

  const isEditable = !!event && role === "coordinator" && event.status === "planning";
  const isCancellable =
    !!event &&
    role === "coordinator" &&
    ["requested", "planning", "pending_safety_check", "confirmed"].includes(event.status);

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
                {notice && (
                  <p
                    role="status"
                    className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
                  >
                    {notice}
                  </p>
                )}
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
                  {/* One group, so the actions sit together on the right
                      instead of being spread across the row. */}
                  {(isEditable || canComplete || isCancellable || role === "organiser") && (
                    <div className="flex flex-col items-end gap-1.5">
                      <div role="group" aria-label="Event actions" className="flex flex-wrap items-start justify-end gap-2">
                        {/* The organiser's way to change the event. */}
                        {role === "organiser" && (
                          <ChangeRequestPanel
                            eventId={event.id}
                            eventStatus={event.status}
                            role={role}
                            isEventAssigned={!!event.assignedCoordinatorId}
                            className="flex max-w-xs flex-col items-end gap-1 text-right text-sm"
                            compact
                          />
                        )}
                        {isEditable && (
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
                        {canComplete && (
                          <Button
                            size="sm"
                            disabled={completionNotYetAllowed}
                            onClick={() => setShowCompleteDialog(true)}
                          >
                            Mark as completed
                          </Button>
                        )}
                        {isCancellable && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setShowCancelDialog(true)}
                          >
                            Cancel event
                          </Button>
                        )}
                      </div>
                      {canComplete && completionNotYetAllowed && completionAvailableAt && (
                        <p className="text-sm text-slate-500">
                          Can be completed from {formatDateTime(completionAvailableAt)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
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
                {/* SPM-38: the change request to decide or apply, at the top
                    so the coordinator sees what was asked for straight away.
                    Unlike ClarificationPanel, a Lead sees this when the event
                    has no assigned coordinator yet — that's the one case a
                    Lead decides a change request directly (AC06). */}
                {role !== "organiser" && (role !== "lead" || !event.assignedCoordinatorId) && (
                  <ChangeRequestPanel
                    eventId={event.id}
                    eventStatus={event.status}
                    role={role}
                    isEventAssigned={!!event.assignedCoordinatorId}
                    className="mt-4 text-sm"
                  />
                )}
                {/* The organiser's own banner, first thing on their page. */}
                {role === "organiser" && event.organiserId === user?.id && (
                  <EventBannerSection
                    eventId={event.id}
                    organiserId={event.organiserId}
                    bannerPath={event.bannerPath}
                    onChanged={(bannerPath) => setEvent({ ...event, bannerPath })}
                  />
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

                {/* SPM-90: the coordinator's safety checks, recorded on the
                    Venue and Equipment steps; summarised here. */}
                {role !== "organiser" && (
                  <SafetyPlanSummary
                    eventId={event.id}
                    emergencyAccessChecked={event.emergencyAccessChecked}
                    restrictionsChecked={event.restrictionsChecked}
                    crowdMovementChecked={event.crowdMovementChecked}
                    equipmentPlacement={event.equipmentPlacement}
                    equipmentPlacementFlagged={event.safetyCheckFlags.includes("equipment_placement")}
                    hasEquipment={event.equipment.length > 0}
                  />
                )}

<RegistrationSettingsSection
                  eventId={event.id}
                  status={event.status}
                  registration={event.registration}
                  isOwnOrganiser={role === "organiser" && event.organiserId === user?.id}
                  onSaved={(registration) => setEvent({ ...event, registration })}
                />

                <EventDocumentsSection
                  eventId={event.id}
                  status={event.status}
                  isOwnOrganiser={role === "organiser" && event.organiserId === user?.id}
                  currentUserId={user?.id}
                />

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
                    onDecided={(decision) => {
                      // Stay on the event: reload it so its new status
                      // (Planning or Rejected) and next steps show here.
                      setNotice(
                        decision === "approved" ? "Event approved — now in planning." : "Event rejected.",
                      );
                      loadEventDetail(event.id)
                        .then(setEvent)
                        .catch(() => {
                          // The decision is saved; a stale view is corrected on refresh.
                        });
                    }}
                    className="mt-6 text-sm"
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {showCompleteDialog && event && (
        <CompleteEventDialog
          eventTitle={event.title}
          onCancel={() => setShowCompleteDialog(false)}
          onConfirm={handleComplete}
        />
      )}
      {showCancelDialog && (
        <CancelEventDialog onCancel={() => setShowCancelDialog(false)} onSubmit={handleCancel} />
      )}
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
