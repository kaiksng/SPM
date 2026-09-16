import { eventFieldHistoryLabel } from "@spm/shared";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  listClarifications,
  type ClarificationSummary,
} from "@/features/event-requests/services/clarifications";
import { listEventDecisions } from "@/features/event-requests/services/decisions";
import {
  loadEventFieldHistory,
  type EventFieldChange,
} from "@/features/event-requests/services/field-history";
import { formatEventFieldChangeValue } from "@/features/event-requests/utils/format-field-change-value";
import { Modal } from "@/features/event-requests/components/modal";

const dateFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * The event's full history, spanning both sides of the approval decision: a
 * "Pre-Approved" stage (clarification rounds while it was Requested, each
 * with whichever fields the organiser edited during that round) and a
 * "Planning" stage (direct edits the coordinator — or organiser — makes once
 * it's approved; PB-07's event_field_changes log covers those). Rendered as
 * its own button + popup, independent of ClarificationPanel, since the
 * Planning stage only exists once the event has left Requested — the point
 * at which ClarificationPanel itself stops rendering.
 */
export function EventHistoryButton({ eventId }: { eventId: string }) {
  const [clarifications, setClarifications] = useState<ClarificationSummary[]>([]);
  const [fieldChanges, setFieldChanges] = useState<EventFieldChange[]>([]);
  const [approvedAt, setApprovedAt] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => {
    let active = true;

    Promise.all([
      listClarifications(eventId).catch(() => [] as ClarificationSummary[]),
      loadEventFieldHistory(eventId).catch(() => [] as EventFieldChange[]),
      listEventDecisions(eventId).catch(() => []),
    ]).then(([clarificationRows, fieldChangeRows, decisions]) => {
      if (!active) return;
      setClarifications(clarificationRows);
      setFieldChanges(fieldChangeRows);
      setApprovedAt(decisions.find((d) => d.decision === "approved")?.decidedAt);
      setLoaded(true);
    });

    return () => {
      active = false;
    };
  }, [eventId]);

  if (!loaded) return null;
  if (clarifications.length === 0 && fieldChanges.length === 0) return null;

  const planningChanges = approvedAt
    ? fieldChanges.filter((change) => change.changedAt >= approvedAt)
    : [];
  const preApprovalChanges = approvedAt
    ? fieldChanges.filter((change) => change.changedAt < approvedAt)
    : fieldChanges;

  return (
    <>
      <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowDialog(true)}>
        View change history
      </Button>
      {showDialog && (
        <Modal
          titleId="event-history-title"
          title="Change history"
          size="large"
          onCancel={() => setShowDialog(false)}
        >
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
            <HistorySection title="Planning" className="mt-6">
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

          <div className="mt-4 flex justify-end">
            <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
              Close
            </Button>
          </div>
        </Modal>
      )}
    </>
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

function HistorySection({
  title,
  className = "",
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={className}>
      <h3 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">{title}</h3>
      <div className="mt-3">{children}</div>
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
