import {
  clarificationPermittedFieldLabels,
  type ClarificationPermittedField,
} from "@spm/shared";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { ClarificationPanel } from "@/features/event-requests/components/clarification-panel";
import { RequirementHistoryPanel } from "@/features/event-requests/components/requirement-history-panel";
import { EventStatusBadge } from "@/features/event-requests/components/status-badges";
import type { ClarificationSummary } from "@/features/event-requests/services/clarifications";
import {
  loadEventDetail,
  type EventDetail,
} from "@/features/event-requests/services/event-details";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

const dateTimeFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDateTime(value: string | null) {
  return value ? dateTimeFormatter.format(new Date(value)) : "Not set";
}

/**
 * A read-only view of an event for whoever can see it (organiser or the
 * assigned coordinator) — the coordinator's counterpart to the organiser's
 * "Edit request" page, which already doubles as their own full-detail view.
 */
export function EventDetailPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [event, setEvent] = useState<EventDetail>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [reviewState, setReviewState] = useState<"open" | "answered">();
  const [unresolvedClarification, setUnresolvedClarification] =
    useState<ClarificationSummary>();

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

  const role = profile?.role === "event_organiser" ? "organiser" : "coordinator";

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-4xl">
          <Link
            to="/events"
            className={buttonVariants({ variant: "ghost", className: "-ml-2" })}
          >
            <ArrowLeft /> Back to events
          </Link>

          {loading ? (
            <div className="mt-7 h-96 animate-pulse rounded-2xl bg-slate-200/70 motion-reduce:animate-none" />
          ) : error || !event ? (
            <section className="mt-7 rounded-2xl border border-red-200 bg-red-50 p-6">
              <h1 className="font-semibold text-red-900">Event unavailable</h1>
              <p role="alert" className="mt-2 text-sm text-red-800">
                {error ?? "This event could not be found."}
              </p>
            </section>
          ) : (
            <div className="mt-6">
              <div className="flex flex-wrap items-center gap-2">
                <EventStatusBadge
                  status={event.status}
                  reviewState={reviewState === "open" ? "open" : undefined}
                  role={role}
                />
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
                      className: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
                    })}
                  >
                    Edit event
                  </Link>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500">
                {event.organiserName && <span>Organiser: {event.organiserName}</span>}
                {event.assignedCoordinatorName && (
                  <span>Coordinator: {event.assignedCoordinatorName}</span>
                )}
                {event.submittedAt && (
                  <span>Submitted {formatDateTime(event.submittedAt)}</span>
                )}
              </div>
              {event.status === "confirmed" && (
                <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  This event is confirmed. Direct edits are locked to keep finalised arrangements
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

              <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
                <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">
                  Venue &amp; facilities
                </h2>
                <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Preferred location" value={event.venue.preferredLocation} />
                  <Field
                    label="Minimum capacity"
                    value={event.venue.minimumCapacity?.toString() ?? null}
                  />
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
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium text-slate-400">Required facilities</dt>
                    <dd className="mt-2 flex flex-wrap gap-1.5">
                      {event.venue.facilities.length > 0 ? (
                        event.venue.facilities.map((facility) => (
                          <span
                            key={facility}
                            className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700"
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

              <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
                <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">
                  Equipment
                </h2>
                {event.equipment.length > 0 ? (
                  <ul className="mt-4 space-y-2">
                    {event.equipment.map((item, index) => (
                      <li
                        key={`${item.equipmentName}-${index}`}
                        className="flex items-baseline justify-between gap-3 text-sm text-slate-800"
                      >
                        <span>
                          {item.equipmentName}
                          {item.notes && (
                            <span className="text-slate-500"> — {item.notes}</span>
                          )}
                        </span>
                        <span className="shrink-0 text-slate-500">×{item.quantity}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 text-sm text-slate-500">No equipment required</p>
                )}
              </section>

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

              <RequirementHistoryPanel
                eventId={event.id}
                eventStatus={event.status}
                role={role}
              />

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
