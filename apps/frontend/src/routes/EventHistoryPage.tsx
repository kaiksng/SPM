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
import { formatEventFieldChangeValue } from "@/features/event-requests/utils/format-field-change-value";
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
  const [fieldChanges, setFieldChanges] = useState<EventFieldChange[]>([]);
  const [equipmentChanges, setEquipmentChanges] = useState<EquipmentChange[]>([]);
  const [statusHistory, setStatusHistory] = useState<EventStatusChange[]>([]);
  const [reassignments, setReassignments] = useState<EventCoordinatorReassignment[]>([]);
  const [assignmentHistory, setAssignmentHistory] = useState<EventCoordinatorAssignmentRecord[]>(
    [],
  );
  const [approvedAt, setApprovedAt] = useState<string>();
  const [event, setEvent] = useState<EventDetail>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  usePageTitle("Change history");

  useEffect(() => {
    if (!eventId) return;
    let active = true;

    Promise.all([
      loadEventDetail(eventId),
      listClarifications(eventId).catch(() => [] as ClarificationSummary[]),
      loadEventFieldHistory(eventId).catch(() => [] as EventFieldChange[]),
      listEventDecisions(eventId).catch(() => []),
      listEventStatusHistory(eventId).catch(() => [] as EventStatusChange[]),
      listEventCoordinatorReassignments(eventId).catch(
        () => [] as EventCoordinatorReassignment[],
      ),
      loadEquipmentHistory(eventId).catch(() => [] as EquipmentChange[]),
      listEventCoordinatorAssignmentHistory(eventId).catch(
        () => [] as EventCoordinatorAssignmentRecord[],
      ),
    ])
      .then(
        ([
          eventDetail,
          clarificationRows,
          fieldChangeRows,
          decisions,
          statusRows,
          reassignmentRows,
          equipmentRows,
          assignmentRows,
        ]) => {
          if (!active) return;
          setEvent(eventDetail);
          setClarifications(clarificationRows);
          setFieldChanges(fieldChangeRows);
          setEquipmentChanges(equipmentRows);
          setApprovedAt(decisions.find((d) => d.decision === "approved")?.decidedAt);
          setStatusHistory(statusRows);
          setReassignments(reassignmentRows);
          setAssignmentHistory(assignmentRows);
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
  }, [eventId]);

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

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-3xl">
          <Link
            to="/events"
            className={buttonVariants({ variant: "ghost", className: "-ml-2" })}
          >
            <ArrowLeft /> Back to events
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
          ) : (
            <div className="mt-7 space-y-6">
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

              <HistorySection title="Pre-Approved">
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

              {/* AC08: the organiser is not shown equipment history (RLS
                  would return nothing for them anyway). */}
              {profile?.role !== "event_organiser" && (
                <HistorySection title="Equipment">
                  <EquipmentHistoryList changes={equipmentChanges} />
                </HistorySection>
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
        {change.changedByName ? ` · ${change.changedByName}` : ""}
      </span>
    </li>
  );
}
