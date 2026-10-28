import { eventFieldHistoryLabel } from "@spm/shared";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { EquipmentHistoryList } from "@/features/event-requests/components/equipment-history-list";
import { StatusBadge } from "@/features/event-requests/components/status-badges";
import {
  listClarifications,
  type ClarificationSummary,
} from "@/features/event-requests/services/clarifications";
import {
  listEventChangeRequests,
  type EventChangeRequestSummary,
} from "@/features/event-requests/services/change-requests";
import { listEventDecisions } from "@/features/event-requests/services/decisions";
import {
  loadEventDetail,
  type EventDetail,
} from "@/features/event-requests/services/event-details";
import {
  loadEquipmentHistory,
  type EquipmentChange,
} from "@/features/event-requests/services/equipment";
import {
  listEventStatusHistory,
  type EventStatusChange,
} from "@/features/event-requests/services/event-lifecycle";
import {
  listEventCoordinatorAssignmentHistory,
  listEventCoordinatorReassignments,
  type EventCoordinatorAssignmentRecord,
  type EventCoordinatorReassignment,
} from "@/features/event-requests/services/event-reassignment";
import {
  loadEventFieldHistory,
  type EventFieldChange,
} from "@/features/event-requests/services/field-history";
import {
  changeRequestStatusLabel,
  describeRequestedChanges,
} from "@/features/event-requests/utils/format-change-request";
import { formatEventFieldChangeValue } from "@/features/event-requests/utils/format-field-change-value";
import {
  listSafetyCheckDecisions,
  type SafetyCheckDecisionHistoryEntry,
} from "@/features/safety-check/services/safety-check-decisions";
import { BookingActivityList } from "@/features/venues/components/booking-activity-list";
import { listVenueDisruptionsForCoordinator } from "@/features/venues/services/venue-disruptions";
import {
  listVenueBookingsForEvent,
  type VenueBookingRequestSummary,
} from "@/features/venues/services/venue-bookings";
import { buildBookingActivity } from "@/features/venues/utils/booking-activity";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

const dateFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

/**
 * The event's full history: the lifecycle timeline, the "Pre-Approved" stage
 * (clarification rounds while it was Requested, each with whichever fields
 * the organiser edited during that round), and the "Planning" stage (direct
 * edits the coordinator — or organiser — makes once it's approved; PB-07's
 * event_field_changes log covers those). Its own page, not a popup, so it
 * can be linked to directly and doesn't compete for space with the event
 * detail page underneath it.
 */
export function EventHistoryPage() {
  const { eventId } = useParams();
  const { profile, user } = useAuth();
  const [clarifications, setClarifications] = useState<ClarificationSummary[]>([]);
  const [changeRequests, setChangeRequests] = useState<EventChangeRequestSummary[]>([]);
  const [fieldChanges, setFieldChanges] = useState<EventFieldChange[]>([]);
  const [equipmentChanges, setEquipmentChanges] = useState<EquipmentChange[]>([]);
  const [statusHistory, setStatusHistory] = useState<EventStatusChange[]>([]);
  const [reassignments, setReassignments] = useState<EventCoordinatorReassignment[]>([]);
  const [assignmentHistory, setAssignmentHistory] = useState<EventCoordinatorAssignmentRecord[]>(
    [],
  );
  const [venueBookings, setVenueBookings] = useState<VenueBookingRequestSummary[]>([]);
  const [safetyCheckDecisions, setSafetyCheckDecisions] = useState<SafetyCheckDecisionHistoryEntry[]>([]);
  // SPM-83: bookings of this event that a venue block currently disrupts.
  const [openDisruptions, setOpenDisruptions] = useState<{ bookingId: string; flaggedAt: string }[]>([]);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [approvedAt, setApprovedAt] = useState<string>();
  const [event, setEvent] = useState<EventDetail>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  usePageTitle("Change history");

  const isSafetyOfficer = profile?.role === "safety_officer";

  useEffect(() => {
    if (!eventId) return;
    let active = true;

    // A Safety Officer's history view is scoped to the safety-check review
    // rounds only (see this story's plan) — every other loader here is
    // outside their RLS access once this story's can_view_event scoping
    // (pending_safety_check only) no longer applies, and showing the rest
    // of this page's sections to them would be unreviewed, over-broad
    // access beyond what reviewing an event's safety requires.
    if (isSafetyOfficer) {
      Promise.all([
        loadEventDetail(eventId),
        listSafetyCheckDecisions(eventId).catch(() => [] as SafetyCheckDecisionHistoryEntry[]),
      ])
        .then(([eventDetail, safetyCheckDecisionRows]) => {
          if (!active) return;
          setEvent(eventDetail);
          setSafetyCheckDecisions(safetyCheckDecisionRows);
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

    Promise.all([
      loadEventDetail(eventId),
      listClarifications(eventId).catch(() => [] as ClarificationSummary[]),
      loadEventFieldHistory(eventId).catch(() => [] as EventFieldChange[]),
      listEventDecisions(eventId).catch(() => []),
      listEventChangeRequests(eventId).catch(() => [] as EventChangeRequestSummary[]),
      listEventStatusHistory(eventId).catch(() => [] as EventStatusChange[]),
      listEventCoordinatorReassignments(eventId).catch(
        () => [] as EventCoordinatorReassignment[],
      ),
      loadEquipmentHistory(eventId).catch(() => [] as EquipmentChange[]),
      listEventCoordinatorAssignmentHistory(eventId).catch(
        () => [] as EventCoordinatorAssignmentRecord[],
      ),
      listVenueBookingsForEvent(eventId).catch(() => [] as VenueBookingRequestSummary[]),
      // Non-critical, and limited by access rules to the people who act on disruptions.
      listVenueDisruptionsForCoordinator().catch(() => []),
      listSafetyCheckDecisions(eventId).catch(() => [] as SafetyCheckDecisionHistoryEntry[]),
    ])
      .then(
        ([
          eventDetail,
          clarificationRows,
          fieldChangeRows,
          decisions,
          changeRequestRows,
          statusRows,
          reassignmentRows,
          equipmentRows,
          assignmentRows,
          venueBookingRows,
          disruptionRows,
          safetyCheckDecisionRows,
        ]) => {
          if (!active) return;
          setEvent(eventDetail);
          setClarifications(clarificationRows);
          setChangeRequests(changeRequestRows);
          setFieldChanges(fieldChangeRows);
          setEquipmentChanges(equipmentRows);
          setApprovedAt(decisions.find((d) => d.decision === "approved")?.decidedAt);
          setStatusHistory(statusRows);
          setVenueBookings(venueBookingRows);
          setOpenDisruptions(
            disruptionRows
              .filter((row) => row.eventId === eventId && row.state !== "resolved")
              .map((row) => ({ bookingId: row.bookingId, flaggedAt: row.flaggedAt })),
          );
          setReassignments(reassignmentRows);
          setAssignmentHistory(assignmentRows);
          setSafetyCheckDecisions(safetyCheckDecisionRows);
        },
      )
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
  }, [eventId, isSafetyOfficer]);

  // SPM-09 AC02: same "assigned coordinator only" rule as EventDetailPage —
  // a coordinator who isn't assigned to this event gets the same denial as
  // an event that failed to load, rather than an empty-but-visible page.
  const isUnassignedCoordinator =
    !!event && profile?.role === "event_coordinator" && event.assignedCoordinatorId !== user?.id;

  const planningChanges = approvedAt
    ? fieldChanges.filter((change) => change.changedAt >= approvedAt)
    : [];
  const preApprovalChanges = approvedAt
    ? fieldChanges.filter((change) => change.changedAt < approvedAt)
    : fieldChanges;
  // Edits the organiser made after submitting but before any clarification
  // round (e.g. while still waiting for the Lead to assign a coordinator).
  // editsDuringRound only covers edits inside a round, so without this they
  // were recorded but never shown. Draft-stage edits stay hidden: before the
  // first submission the event is still the organiser's private work.
  const firstSubmittedAt = statusHistory.find((change) => change.toStatus === "submitted")?.changedAt;
  const firstRoundAt = clarifications[0]?.requestedAt;
  const editsBeforeReview = firstSubmittedAt
    ? preApprovalChanges.filter(
        (change) =>
          change.changedAt >= firstSubmittedAt &&
          (!firstRoundAt || change.changedAt < firstRoundAt),
      )
    : [];

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-3xl">
          {/* Back to the event this history belongs to, like every other event
              sub-page; a Safety Officer arrives from their queue instead. */}
          <Link
            to={isSafetyOfficer ? "/safety-checks" : `/events/${eventId}`}
            className={buttonVariants({ variant: "ghost", className: "-ml-2" })}
          >
            <ArrowLeft /> {isSafetyOfficer ? "Back to safety checks" : "Back to event"}
          </Link>

          <header className="mt-6 border-b border-slate-200 pb-7">
            <h1 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950">
              Change history
            </h1>
          </header>

          {loading ? (
            <div className="mt-7 h-96 animate-pulse rounded-2xl bg-slate-200/70 motion-reduce:animate-none" />
          ) : error || !event || isUnassignedCoordinator ? (
            <section className="mt-7 rounded-2xl border border-red-200 bg-red-50 p-6">
              <h1 className="font-semibold text-red-900">Event unavailable</h1>
              <p role="alert" className="mt-2 text-sm text-red-800">
                {error ?? "This event is unavailable or you do not have access to it."}
              </p>
            </section>
          ) : isSafetyOfficer ? (
            <div className="mt-7 space-y-6">
              <HistorySection title="Safety check reviews">
                {safetyCheckDecisions.length === 0 ? (
                  <p className="text-sm text-slate-500">No review rounds recorded yet for this event.</p>
                ) : (
                  <ol className="space-y-3">
                    {safetyCheckDecisions.map((decision) => (
                      <SafetyCheckDecisionItem key={decision.id} decision={decision} />
                    ))}
                  </ol>
                )}
              </HistorySection>
            </div>
          ) : (
            <div className="mt-7 space-y-6">
              <div role="group" aria-label="Show history" className="flex flex-wrap gap-2">
                {HISTORY_FILTERS.filter(([value]) => value !== "equipment" || profile?.role !== "event_organiser").map(([value, label]) => (
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
                    {label}
                  </button>
                ))}
              </div>

              <HistoryGroup group="lifecycle" filter={filter}>
              <HistorySection title="Lifecycle">
                {statusHistory.length === 0 ? (
                  <p className="text-sm text-slate-500">No status changes recorded yet.</p>
                ) : (
                  <ol className="space-y-2">
                    {statusHistory.map((change) => (
                      <StatusChangeItem key={change.id} change={change} />
                    ))}
                  </ol>
                )}
              </HistorySection>

              {reassignments.length > 0 && (
                <HistorySection title="Reassignments">
                  <ol className="space-y-2">
                    {reassignments.map((reassignment) => (
                      <ReassignmentItem key={reassignment.id} reassignment={reassignment} />
                    ))}
                  </ol>
                </HistorySection>
              )}

              {assignmentHistory.length > 0 && (
                <HistorySection title="Coordinator assignments">
                  <ol className="space-y-2">
                    {assignmentHistory.map((record) => (
                      <AssignmentHistoryItem key={record.id} record={record} />
                    ))}
                  </ol>
                </HistorySection>
              )}

              {safetyCheckDecisions.length > 0 && (
                <HistorySection title="Safety check reviews">
                  <ol className="space-y-3">
                    {safetyCheckDecisions.map((decision) => (
                      <SafetyCheckDecisionItem key={decision.id} decision={decision} />
                    ))}
                  </ol>
                </HistorySection>
              )}

              </HistoryGroup>

              <HistoryGroup group="edits" filter={filter}>
              <HistorySection title="Pre-Approved">
                {editsBeforeReview.length > 0 && (
                  <div className="mb-4">
                    <p className="mb-2 text-sm font-medium text-slate-600">
                      Edited after submission
                    </p>
                    <ol className="space-y-3">
                      {editsBeforeReview.map((change) => (
                        <FieldChangeItem key={change.id} change={change} />
                      ))}
                    </ol>
                  </div>
                )}
                {clarifications.length === 0 ? (
                  <p className="text-sm text-slate-500">No clarification rounds were needed.</p>
                ) : (
                  <ol className="space-y-3">
                    {clarifications.map((c, index) => (
                      <ClarificationRound
                        key={c.id}
                        clarification={c}
                        edits={
                          c.response && c.respondedAt
                            ? editsDuringRound(c, index, clarifications, preApprovalChanges)
                            : []
                        }
                      />
                    ))}
                  </ol>
                )}
              </HistorySection>

              {approvedAt && (
                <HistorySection title="Planning">
                  {planningChanges.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No changes have been made since this event was approved.
                    </p>
                  ) : (
                    <ol className="space-y-3">
                      {planningChanges.map((change) => (
                        <FieldChangeItem key={change.id} change={change} />
                      ))}
                    </ol>
                  )}
                </HistorySection>
              )}

              <HistorySection title="Change requests">
                {changeRequests.length === 0 ? (
                  <p className="text-sm text-slate-500">No change requests have been submitted.</p>
                ) : (
                  <ol className="space-y-3">
                    {changeRequests.map((request) => (
                      <ChangeRequestItem key={request.id} request={request} />
                    ))}
                  </ol>
                )}
              </HistorySection>

              </HistoryGroup>

              <HistoryGroup group="venue" filter={filter}>
                <HistorySection title="Venue bookings">
                  <BookingActivityList
                    entries={buildBookingActivity(venueBookings, openDisruptions)}
                    emptyText="No venue booking requests made yet."
                  />
                </HistorySection>
              </HistoryGroup>

              {/* AC08: the organiser is not shown equipment history (RLS
                  would return nothing for them anyway). */}
              {profile?.role !== "event_organiser" && (
                <HistoryGroup group="equipment" filter={filter}>
                  <HistorySection title="Equipment">
                    <EquipmentHistoryList changes={equipmentChanges} />
                  </HistorySection>
                </HistoryGroup>
              )}
            </div>
          )}
        </div>
      </div>
    </RoleGate>
  );
}

/**
 * The field(s) an organiser edited while a given round was the active one —
 * from requesting it to whenever the next round (if any) started. There is
 * no direct foreign key between a clarification and the event_field_changes
 * rows an edit produced, so this correlates by time window instead.
 */
function editsDuringRound(
  round: ClarificationSummary,
  index: number,
  clarifications: ClarificationSummary[],
  fieldChanges: EventFieldChange[],
) {
  const windowStart = new Date(round.requestedAt).getTime();
  const nextRound = clarifications[index + 1];
  const windowEnd = nextRound ? new Date(nextRound.requestedAt).getTime() : Infinity;
  return fieldChanges.filter((change) => {
    const changedAt = new Date(change.changedAt).getTime();
    return changedAt >= windowStart && changedAt < windowEnd;
  });
}

type HistoryFilter = "all" | "lifecycle" | "edits" | "venue" | "equipment";

const HISTORY_FILTERS: [HistoryFilter, string][] = [
  ["all", "All"],
  ["lifecycle", "Lifecycle & assignments"],
  ["edits", "Requests & edits"],
  ["venue", "Venue"],
  ["equipment", "Equipment"],
];

function HistoryGroup({
  group,
  filter,
  children,
}: {
  group: HistoryFilter;
  filter: HistoryFilter;
  children: React.ReactNode;
}) {
  return filter === "all" || filter === group ? <>{children}</> : null;
}

function HistorySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ClarificationRound({
  clarification: c,
  edits,
}: {
  clarification: ClarificationSummary;
  edits: EventFieldChange[];
}) {
  return (
    <li className="text-sm text-slate-600">
      <p>
        Coordinator requested {dateFormatter.format(new Date(c.requestedAt))}: "{c.question}"
      </p>
      {c.response && c.respondedAt && (
        <p>
          Organiser responded {dateFormatter.format(new Date(c.respondedAt))}: "{c.response}"
        </p>
      )}
      {edits.length > 0 && (
        <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 p-2">
          <p className="font-medium text-slate-600">Organiser has edited these field(s):</p>
          <ul className="mt-1 space-y-0.5">
            {edits.map((change) => (
              <FieldChangeLine key={change.id} change={change} />
            ))}
          </ul>
        </div>
      )}
      {c.status === "resolved" && c.resolvedAt && (
        <p>Coordinator resolved {dateFormatter.format(new Date(c.resolvedAt))}</p>
      )}
    </li>
  );
}

function FieldChangeLine({ change }: { change: EventFieldChange }) {
  return (
    <li>
      <span className="font-medium text-slate-600">{eventFieldHistoryLabel(change.fieldName)}:</span>{" "}
      {formatEventFieldChangeValue(change.fieldName, change.previousValue)}
      {" → "}
      {formatEventFieldChangeValue(change.fieldName, change.newValue)}
      {/* SPM-09 AC05: like a Planning entry, show when and by whom. */}
      <span className="text-xs text-slate-500">
        {" · "}
        {dateFormatter.format(new Date(change.changedAt))}
        {change.changedByName ? ` · ${change.changedByName}` : ""}
      </span>
    </li>
  );
}

function FieldChangeItem({ change }: { change: EventFieldChange }) {
  return (
    <li className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-medium text-slate-800">
          {eventFieldHistoryLabel(change.fieldName)}
        </span>
        <span className="text-xs text-slate-500">
          {dateFormatter.format(new Date(change.changedAt))}
          {change.changedByName ? ` · ${change.changedByName}` : ""}
        </span>
      </div>
      <p className="mt-1 text-slate-600">
        <span className="text-slate-400 line-through">
          {formatEventFieldChangeValue(change.fieldName, change.previousValue)}
        </span>{" "}
        →{" "}
        <span className="text-slate-800">
          {formatEventFieldChangeValue(change.fieldName, change.newValue)}
        </span>
      </p>
    </li>
  );
}

const CHANGE_REQUEST_STATUS_CLASSES: Record<EventChangeRequestSummary["status"], string> = {
  pending: "text-slate-600",
  approved: "text-emerald-700",
  rejected: "text-red-700",
  withdrawn: "text-slate-500",
  implemented: "text-emerald-700",
};

function ChangeRequestItem({ request }: { request: EventChangeRequestSummary }) {
  return (
    <li className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-medium text-slate-800">
          {describeRequestedChanges(request.requestedChanges)}
        </span>
        <span className={`text-xs font-semibold ${CHANGE_REQUEST_STATUS_CLASSES[request.status]}`}>
          {changeRequestStatusLabel(request.status)}
        </span>
      </div>
      <p className="mt-1 text-slate-600">Reason: {request.reason}</p>
      {request.reviewNotes && <p className="mt-1 text-slate-600">Notes: {request.reviewNotes}</p>}
      <p className="mt-1 text-xs text-slate-500">
        Requested {dateFormatter.format(new Date(request.requestedAt))}
        {request.reviewedAt && ` · Reviewed ${dateFormatter.format(new Date(request.reviewedAt))}`}
        {request.withdrawnAt && ` · Withdrawn ${dateFormatter.format(new Date(request.withdrawnAt))}`}
      </p>
    </li>
  );
}

function ReassignmentItem({ reassignment }: { reassignment: EventCoordinatorReassignment }) {
  return (
    <li className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-medium text-slate-800">
          Reassigned to {reassignment.newCoordinatorName ?? "an Event Coordinator"}
        </span>
        <span className="text-xs text-slate-500">
          {dateFormatter.format(new Date(reassignment.changedAt))}
        </span>
      </div>
      {reassignment.previousCoordinatorName && (
        <p className="mt-1 text-slate-500">From {reassignment.previousCoordinatorName}</p>
      )}
      {reassignment.reason && (
        <p className="mt-1 text-slate-600">Reason: "{reassignment.reason}"</p>
      )}
    </li>
  );
}

function AssignmentHistoryItem({ record }: { record: EventCoordinatorAssignmentRecord }) {
  const isCurrent = record.endedAt === null;
  return (
    <li className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-medium text-slate-800">
          {record.newCoordinatorName ?? "An Event Coordinator"}
          {isCurrent && (
            <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              Current
            </span>
          )}
        </span>
        <span className="text-xs text-slate-500">
          {dateFormatter.format(new Date(record.changedAt))}
          {record.endedAt && ` – ${dateFormatter.format(new Date(record.endedAt))}`}
        </span>
      </div>
      {record.previousCoordinatorName && (
        <p className="mt-1 text-slate-500">
          Reassigned from {record.previousCoordinatorName}
          {record.changedByName && ` by ${record.changedByName}`}
        </p>
      )}
      {record.reason && <p className="mt-1 text-slate-600">Reason: "{record.reason}"</p>}
    </li>
  );
}

function StatusChangeItem({ change }: { change: EventStatusChange }) {
  // SPM-12 AC03: a change no person made reads as a system action. A person
  // whose name this viewer cannot see is left unnamed rather than mislabelled.
  const actor = change.changedByName ?? (change.changedById ? null : "System");
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-sm">
      <div className="flex items-center gap-2">
        {change.fromStatus && (
          <>
            <StatusBadge status={change.fromStatus} />
            <span className="text-slate-400" aria-hidden="true">
              →
            </span>
          </>
        )}
        <StatusBadge status={change.toStatus} />
      </div>
      <span className="text-xs text-slate-500">
        {dateFormatter.format(new Date(change.changedAt))}
        {actor ? ` · ${actor}` : ""}
      </span>
    </li>
  );
}

const SAFETY_CHECK_OUTCOME_LABELS: Record<SafetyCheckDecisionHistoryEntry["outcome"], string> = {
  approved: "Approved",
  changes_requested: "Changes requested",
  rejected: "Rejected",
};

const SAFETY_CHECK_OUTCOME_CLASSES: Record<SafetyCheckDecisionHistoryEntry["outcome"], string> = {
  approved: "text-emerald-700",
  changes_requested: "text-orange-700",
  rejected: "text-red-700",
};

/** AC6: each review round's outcome, reason, reviewer and time. */
function SafetyCheckDecisionItem({ decision }: { decision: SafetyCheckDecisionHistoryEntry }) {
  const flaggedCount = decision.flaggedBookingIds.length + decision.flaggedRequirementIds.length;
  return (
    <li className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-sm">
      <p className={`font-semibold ${SAFETY_CHECK_OUTCOME_CLASSES[decision.outcome]}`}>
        Round {decision.round} · {SAFETY_CHECK_OUTCOME_LABELS[decision.outcome]}
      </p>
      {decision.reason && <p className="mt-1 text-slate-600">"{decision.reason}"</p>}
      {decision.outcome === "changes_requested" && flaggedCount > 0 && (
        <p className="mt-1 text-xs text-slate-500">
          {flaggedCount} item{flaggedCount === 1 ? "" : "s"} flagged
        </p>
      )}
      <p className="mt-1 text-xs text-slate-500">
        Reviewed by {decision.decidedByName ?? "a Safety Officer"} ·{" "}
        {dateFormatter.format(new Date(decision.decidedAt))}
      </p>
    </li>
  );
}
