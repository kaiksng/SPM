import {
  automaticEquipmentArrangementStatus,
  currentEquipmentArrangement,
  isEquipmentReservationAllowed,
  describeEquipmentReservationEvent,
  equipmentReservationActionLabels,
  type EquipmentArrangementState,
  type EquipmentRequirementFormValues,
} from "@spm/shared";
import { CirclePlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { ArrangementBadge, ArrangementDetails } from "@/features/equipment/components/equipment-arrangement";
import { loadEquipmentArrangementStatuses } from "@/features/equipment/services/equipment-arrangement-status";
import { EquipmentRequestDialog } from "@/features/event-requests/components/equipment-request-dialog";
import { EventPageTopBar } from "@/features/event-requests/components/event-page-top-bar";
import { EventPlanningTimeline } from "@/features/event-requests/components/event-planning-timeline";
import { Modal } from "@/features/event-requests/components/modal";
import {
  localDateTime,
  saveEventEquipment,
} from "@/features/event-requests/services/coordinator-event-edit";
import {
  EVENT_COMPLETED_RELEASE_REASON,
  listEquipmentArrangements,
  type EquipmentArrangement,
} from "@/features/event-requests/services/equipment-arrangements";
import { loadEventDetail, type EventDetail } from "@/features/event-requests/services/event-details";
import {
  toEquipmentFormValues,
  type EquipmentRequirement,
} from "@/features/event-requests/services/equipment";
import { usePageTitle } from "@/hooks/use-page-title";
import { cn } from "@/lib/utils";
import { RoleGate } from "@/routes/RoleGate";

const dateTimeFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

function formatPeriod(from: string | null, until: string | null) {
  if (!from || !until) return "No period recorded";
  return `${dateTimeFormatter.format(new Date(from))} – ${dateTimeFormatter.format(new Date(until))}`;
}

/**
 * The "Equipment" sub-step of an event's Planning stage: each requested item
 * with the reservation Technical Support Staff made for it (who, when, how
 * many, for which period), any re-check flag, and the reservation history.
 * The assigned coordinator also sees each item's arrangement status, note
 * and history (SPM-28). Read-only — reserving and arranging happen on the
 * Technical Support Staff Equipment page.
 */
export function EventEquipmentPage() {
  const { eventId } = useParams();
  const { user } = useAuth();
  const [event, setEvent] = useState<EventDetail>();
  const [arrangements, setArrangements] = useState<EquipmentArrangement[]>([]);
  const [arrangementStatuses, setArrangementStatuses] = useState<Map<string, EquipmentArrangementState> | null>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [dialog, setDialog] = useState<
    | { kind: "request" }
    | { kind: "edit" | "remove"; requirement: EquipmentRequirement }
  >();
  // Bumped after a save so the page reloads with the new equipment.
  const [reloadKey, setReloadKey] = useState(0);

  usePageTitle(event?.title ? `Equipment — ${event.title}` : "Equipment");

  useEffect(() => {
    if (!eventId) return;
    let active = true;
    setLoading(true);
    Promise.all([
      loadEventDetail(eventId),
      listEquipmentArrangements(eventId),
      // Under RLS only the assigned coordinator gets rows; others get none.
      // Extra detail: if it can't be loaded, the rest of the page still shows.
      loadEquipmentArrangementStatuses([eventId]).catch(() => null),
    ])
      .then(([detail, rows, statuses]) => {
        if (!active) return;
        setEvent(detail);
        setArrangements(rows);
        setArrangementStatuses(statuses);
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
  }, [eventId, reloadKey]);

  async function saveEquipment(
    change: (equipment: EquipmentRequirementFormValues[]) => EquipmentRequirementFormValues[],
  ) {
    if (!eventId) return;
    await saveEventEquipment(eventId, change);
    setDialog(undefined);
    setReloadKey((key) => key + 1);
  }

  const liveByRequirement = new Map(
    arrangements
      .filter((arrangement) => arrangement.status === "reserved" && arrangement.requirementId)
      .map((arrangement) => [arrangement.requirementId!, arrangement]),
  );
  // Reservations whose request was removed still matter until released.
  const orphaned = arrangements.filter(
    (arrangement) => arrangement.status === "reserved" && !arrangement.requirementId,
  );
  const released = arrangements.filter((arrangement) => arrangement.status === "released");
  // SPM-28 visibility: the assigned coordinator. Anyone else who can open
  // this page would see every item as Not started, so the status is hidden.
  const showArrangementStatus = Boolean(arrangementStatuses && user && event?.assignedCoordinatorId === user.id);
  // Requested, edited and removed here by the assigned coordinator, and only
  // while the event is in Planning — the same rule update_event_as_coordinator
  // enforces.
  const canEditEquipment = Boolean(
    user && event?.assignedCoordinatorId === user.id && event.status === "planning",
  );

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-5xl">
          {/* The change history stays a click away on the event page. */}
          <EventPageTopBar
            backTo={`/events/${eventId}`}
            backLabel="Back to event"
            eventId={eventId}
            showHistory={false}
          />

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
            <div className="mt-6 lg:flex lg:items-start lg:gap-10">
              <div className="mb-6 lg:mb-0 lg:sticky lg:top-24">
                <EventPlanningTimeline status={event.status} eventId={event.id} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h1 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950">Equipment</h1>
                  {canEditEquipment && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setDialog({ kind: "request" })}
                    >
                      <CirclePlus /> Request equipment
                    </Button>
                  )}
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  What the event requested and what Technical Support Staff have reserved for it.
                </p>

                <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
                  <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">Arrangements</h2>
                  {event.equipment.length === 0 && orphaned.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-500">No equipment was requested for this event.</p>
                  ) : (
                    <ul className="mt-4 space-y-3">
                      {event.equipment.map((requirement) => (
                        <RequirementArrangement
                          key={requirement.id}
                          requirement={requirement}
                          reservation={liveByRequirement.get(requirement.id)}
                          arrangement={
                            showArrangementStatus
                              ? (arrangementStatuses?.get(requirement.id) ??
                                currentEquipmentArrangement(
                                  [],
                                  // Stock levels aren't available to coordinators, so an
                                  // unreserved catalogue item shows Not started here.
                                  automaticEquipmentArrangementStatus({
                                    requestedQuantity: requirement.quantity,
                                    reservation: liveByRequirement.get(requirement.id) ?? null,
                                    canReserveInFull:
                                      requirement.equipmentItemId !== null &&
                                      isEquipmentReservationAllowed(event.status),
                                  }),
                                ))
                              : undefined
                          }
                          onEdit={canEditEquipment ? () => setDialog({ kind: "edit", requirement }) : undefined}
                          onRemove={canEditEquipment ? () => setDialog({ kind: "remove", requirement }) : undefined}
                        />
                      ))}
                      {orphaned.map((reservation) => (
                        <li key={reservation.id} className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
                          <p className="font-medium text-slate-900">
                            {reservation.equipmentName} × {reservation.quantity} reserved
                          </p>
                          <p className="mt-1 text-amber-900">
                            Needs re-check: {reservation.recheckReason ?? "the equipment request was removed"}
                          </p>
                          <ReservationHistory reservation={reservation} />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {released.length > 0 && (
                  <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
                    <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">
                      Released reservations
                    </h2>
                    <ul className="mt-4 space-y-3">
                      {released.map((reservation) => {
                        // SPM-46 AC06: released because the event was completed is
                        // the record of what was used, not a cancellation.
                        const releasedOnCompletion =
                          reservation.releaseReason === EVENT_COMPLETED_RELEASE_REASON;
                        return (
                          <li key={reservation.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-4 text-sm">
                            <p className={cn("font-medium text-slate-500", !releasedOnCompletion && "line-through")}>
                              {reservation.equipmentName} × {reservation.quantity}
                            </p>
                            <p className="mt-1 text-slate-600">
                              Reserved for {formatPeriod(reservation.startsAt, reservation.endsAt)}
                              {reservation.reservedByName ? ` by ${reservation.reservedByName}` : ""}
                            </p>
                            <p className="mt-1 text-slate-500">
                              {releasedOnCompletion ? "Released – event completed" : "Released"}
                              {reservation.releasedAt ? ` ${dateTimeFormatter.format(new Date(reservation.releasedAt))}` : ""}
                            </p>
                            <ReservationHistory reservation={reservation} />
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {event && dialog?.kind === "request" && (
        <EquipmentRequestDialog
          title="Request equipment"
          submitLabel="Request equipment"
          // A new item is needed for the event's own period.
          initialValues={{
            id: "",
            equipmentItemId: "",
            legacyName: "",
            quantity: "",
            requiredFrom: localDateTime(event.startsAt),
            requiredUntil: localDateTime(event.endsAt),
            notes: "",
          }}
          periodLabel={formatPeriod(event.startsAt, event.endsAt)}
          reserved={false}
          onCancel={() => setDialog(undefined)}
          onSubmit={(values) => saveEquipment((equipment) => [...equipment, values])}
        />
      )}
      {dialog?.kind === "edit" && (
        <EquipmentRequestDialog
          title={`Edit ${dialog.requirement.equipmentName}`}
          submitLabel="Save changes"
          initialValues={toEquipmentFormValues([dialog.requirement])[0]!}
          periodLabel={formatPeriod(dialog.requirement.requiredFrom, dialog.requirement.requiredUntil)}
          reserved={liveByRequirement.has(dialog.requirement.id)}
          onCancel={() => setDialog(undefined)}
          onSubmit={(values) =>
            saveEquipment((equipment) => equipment.map((item) => (item.id === values.id ? values : item)))
          }
        />
      )}
      {dialog?.kind === "remove" && (
        <RemoveEquipmentDialog
          requirement={dialog.requirement}
          reserved={liveByRequirement.has(dialog.requirement.id)}
          onCancel={() => setDialog(undefined)}
          onConfirm={() =>
            saveEquipment((equipment) => equipment.filter((item) => item.id !== dialog.requirement.id))
          }
        />
      )}
    </RoleGate>
  );
}

function RemoveEquipmentDialog({
  requirement,
  reserved,
  onCancel,
  onConfirm,
}: {
  requirement: EquipmentRequirement;
  reserved: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<unknown>;
}) {
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string>();

  async function handleConfirm() {
    setRemoving(true);
    setError(undefined);
    try {
      await onConfirm();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "This equipment could not be removed.");
      setRemoving(false);
    }
  }

  return (
    <Modal titleId="remove-equipment-dialog-title" title={`Remove ${requirement.equipmentName}?`} onCancel={onCancel}>
      <div className="mt-4 space-y-4 text-sm">
        <p className="leading-6 text-slate-600">
          {requirement.equipmentName} × {requirement.quantity} will no longer be requested for this event.
          {reserved && " It is reserved, so Technical Support Staff will be asked to check and release it."}
        </p>
        {error && (
          <p role="alert" className="text-red-700">{error}</p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Keep it
          </Button>
          <Button type="button" variant="destructive" disabled={removing} onClick={handleConfirm}>
            {removing ? "Removing…" : "Remove"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function RequirementArrangement({
  requirement,
  reservation,
  arrangement,
  onEdit,
  onRemove,
}: {
  requirement: EquipmentRequirement;
  reservation?: EquipmentArrangement;
  /** SPM-28 status, note and history; absent when the viewer may not see it. */
  arrangement?: EquipmentArrangementState;
  /** Only for the assigned coordinator while the event is in Planning. */
  onEdit?: () => void;
  onRemove?: () => void;
}) {
  const state = !reservation ? "pending" : reservation.needsRecheck ? "recheck" : "reserved";
  return (
    <li
      className={cn(
        "rounded-xl border p-4 text-sm",
        state === "reserved" && "border-emerald-200 bg-emerald-50/60",
        state === "recheck" && "border-amber-300 bg-amber-50",
        state === "pending" && "border-slate-200 bg-slate-50/70",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium text-slate-900">
          {requirement.equipmentName} × {requirement.quantity}
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-semibold",
            state === "reserved" && "bg-emerald-100 text-emerald-800",
            state === "recheck" && "bg-amber-100 text-amber-800",
            state === "pending" && "bg-slate-200 text-slate-600",
          )}
        >
          {state === "reserved" ? "Reserved" : state === "recheck" ? "Needs re-check" : "Not reserved yet"}
        </span>
      </div>
      <p className="mt-1 text-slate-600">{formatPeriod(requirement.requiredFrom, requirement.requiredUntil)}</p>
      {arrangement && (
        <div className="mt-2">
          <ArrangementBadge arrangement={arrangement} />
          <ArrangementDetails arrangement={arrangement} />
        </div>
      )}
      {reservation && (
        <>
          <p className="mt-2 text-slate-800">
            {reservation.quantity} reserved for {formatPeriod(reservation.startsAt, reservation.endsAt)}
            {reservation.reservedByName ? ` by ${reservation.reservedByName}` : ""}
            {reservation.reservedAt ? ` on ${dateTimeFormatter.format(new Date(reservation.reservedAt))}` : ""}
          </p>
          {reservation.needsRecheck && (
            <p className="mt-1 text-amber-900">{reservation.recheckReason ?? "The request changed after it was reserved."}</p>
          )}
          <ReservationHistory reservation={reservation} />
        </>
      )}
      {(onEdit || onRemove) && (
        <div className="mt-3 flex gap-2">
          {onEdit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={`Edit ${requirement.equipmentName}`}
              onClick={onEdit}
            >
              Edit
            </Button>
          )}
          {onRemove && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={`Remove ${requirement.equipmentName}`}
              onClick={onRemove}
              className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
            >
              Remove
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function ReservationHistory({ reservation }: { reservation: EquipmentArrangement }) {
  if (reservation.history.length === 0) return null;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs font-medium text-slate-500">
        History ({reservation.history.length})
      </summary>
      <ol className="mt-2 space-y-1 text-xs text-slate-600">
        {reservation.history.map((entry) => (
          <li key={entry.id}>
            <span className="font-medium text-slate-700">{equipmentReservationActionLabels[entry.action]}</span>
            {" · "}
            {describeEquipmentReservationEvent(entry.action, entry.details)}
            {" · "}
            {dateTimeFormatter.format(new Date(entry.occurredAt))}
            {entry.actorName ? ` · ${entry.actorName}` : ""}
          </li>
        ))}
      </ol>
    </details>
  );
}
