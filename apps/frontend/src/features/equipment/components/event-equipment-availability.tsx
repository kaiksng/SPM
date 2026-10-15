import {
  equipmentArrangementStatuses,
  equipmentArrangementStatusLabels,
  equipmentAvailabilityStatusLabels,
  equipmentShortage,
  isEquipmentReservationAllowed,
  overallEquipmentAvailability,
  type EquipmentArrangementFormValues,
  type EquipmentArrangementStatus,
  type EquipmentAvailabilityStatus,
} from "@spm/shared";
import { CalendarDays, Search } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrangementDialog } from "@/features/equipment/components/arrangement-dialog";
import { ArrangementBadge, ArrangementDetails } from "@/features/equipment/components/equipment-arrangement";
import {
  ReleaseReservationDialog,
  ReservationDialog,
  type ReservationAction,
} from "@/features/equipment/components/reservation-dialog";
import type {
  EquipmentAvailabilityResult,
  EventEquipmentAvailability,
  OrphanedReservation,
} from "@/features/equipment/services/equipment-availability";
import {
  arrangementStatusCounts,
  arrangementStatusesLoaded,
  eventsWithArrangementStatus,
} from "@/features/equipment/utils/request-groups";
import { StatusBadge } from "@/features/event-requests/components/status-badges";
import { cn } from "@/lib/utils";

const dateFormat = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

const statusStyles: Record<EquipmentAvailabilityStatus, string> = {
  available: "bg-emerald-100 text-emerald-800",
  partially_available: "bg-amber-100 text-amber-800",
  unavailable: "bg-red-100 text-red-800",
  unknown: "bg-slate-200 text-slate-700",
};

function formatPeriod(from: string | null, until: string | null) {
  if (!from || !until) return "No period recorded";
  return `${dateFormat.format(new Date(from))} – ${dateFormat.format(new Date(until))}`;
}

type Handlers = {
  onReserve: (requirementId: string, quantity: number) => Promise<void>;
  onChange: (reservationId: string, quantity: number) => Promise<void>;
  onRelease: (reservationId: string, reason: string) => Promise<void>;
  /** SPM-28: record a new arrangement status and note. */
  onUpdateArrangement: (requirementId: string, values: EquipmentArrangementFormValues) => Promise<void>;
};

type PendingAction = {
  action: ReservationAction | "arrangement";
  event: EventEquipmentAvailability;
  result: EquipmentAvailabilityResult;
};

/**
 * SPM-31: each open event's requested equipment against what can be
 * provided — and, from here, reserving it, changing or releasing the
 * reservation, re-checking one flagged after a change, and (SPM-28)
 * updating its arrangement status and note. Items are sorted into tabs by
 * arrangement status (Not started / In progress / Arranged / Issue), each
 * shown under its event.
 */
export function EventEquipmentAvailabilityList({
  events,
  onReserve,
  onChange,
  onRelease,
  onUpdateArrangement,
}: { events: EventEquipmentAvailability[] } & Handlers) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<EquipmentArrangementStatus>("not_started");
  const [pending, setPending] = useState<PendingAction>();
  const [releasing, setReleasing] = useState<{ event: EventEquipmentAvailability; reservation: OrphanedReservation }>();
  const [rowError, setRowError] = useState<{ requirementId: string; message: string }>();

  async function recheck(result: EquipmentAvailabilityResult) {
    if (!result.reservation) return;
    setRowError(undefined);
    try {
      await onChange(result.reservation.id, result.reservation.quantity);
    } catch (cause) {
      setRowError({
        requirementId: result.requirementId,
        message: cause instanceof Error ? cause.message : "This reservation could not be re-checked.",
      });
    }
  }

  const search = query.trim().toLowerCase();
  const searched = search ? events.filter((event) => event.title.toLowerCase().includes(search)) : events;
  // Without the statuses (e.g. the SPM-28 migration isn't applied), every
  // item is listed untabbed rather than hidden.
  const tabbed = arrangementStatusesLoaded(searched);
  const counts = arrangementStatusCounts(searched);
  const visible = tabbed
    ? eventsWithArrangementStatus(searched, tab)
    : searched.map((event) => ({
        event,
        results: event.results,
        orphanedReservations: event.orphanedReservations ?? [],
      }));

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
          />
          <Input
            type="search"
            aria-label="Search events"
            placeholder="Search by event name"
            className="pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      {tabbed && (
        <div role="tablist" aria-label="Arrangement status" className="mt-5 flex flex-wrap gap-2">
          {equipmentArrangementStatuses.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                tab === key
                  ? "border-primary bg-primary text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-primary/40 hover:text-slate-900",
              )}
            >
              {equipmentArrangementStatusLabels[key]}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs font-semibold",
                  tab === key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600",
                )}
              >
                {counts[key]}
              </span>
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
          {events.length === 0
            ? "No open events have requested equipment."
            : search && searched.length === 0
              ? "No events match your search."
              : emptyTabMessages[tab]}
        </p>
      ) : (
        <ul className="mt-5 space-y-4">
          {visible.map(({ event, results, orphanedReservations }) => (
            <EventCard
              key={event.id}
              event={event}
              results={results}
              orphanedReservations={orphanedReservations}
              onReleaseOrphan={(reservation) => setReleasing({ event, reservation })}
              rowError={rowError}
              onAction={(action, result) => {
                setRowError(undefined);
                setPending({ action, event, result });
              }}
              onRecheck={(result) => void recheck(result)}
            />
          ))}
        </ul>
      )}

      {pending?.action === "arrangement" && pending.result.arrangement && (
        <ArrangementDialog
          eventTitle={pending.event.title}
          equipmentName={pending.result.equipmentName}
          arrangement={pending.result.arrangement}
          onCancel={() => setPending(undefined)}
          onSave={async (values) => {
            await onUpdateArrangement(pending.result.requirementId, values);
            setPending(undefined);
          }}
        />
      )}

      {releasing && (
        <ReleaseReservationDialog
          eventTitle={releasing.event.title}
          equipmentName={releasing.reservation.equipmentName}
          quantity={releasing.reservation.quantity}
          startsAt={releasing.reservation.startsAt}
          endsAt={releasing.reservation.endsAt}
          onCancel={() => setReleasing(undefined)}
          onConfirm={async (reason) => {
            await onRelease(releasing.reservation.id, reason);
            setReleasing(undefined);
          }}
        />
      )}

      {pending && pending.action !== "arrangement" && (
        <ReservationDialog
          action={pending.action}
          eventTitle={pending.event.title}
          result={pending.result}
          onCancel={() => setPending(undefined)}
          onConfirm={async ({ quantity, reason }) => {
            const reservationId = pending.result.reservation?.id;
            if (pending.action === "reserve") await onReserve(pending.result.requirementId, quantity);
            else if (pending.action === "change" && reservationId) await onChange(reservationId, quantity);
            else if (reservationId) await onRelease(reservationId, reason);
            setPending(undefined);
          }}
        />
      )}
    </div>
  );
}

const emptyTabMessages: Readonly<Record<EquipmentArrangementStatus, string>> = {
  not_started: "Every requested item has been started on.",
  in_progress: "Nothing is in progress.",
  arranged: "Nothing has been arranged yet.",
  issue: "No items have an issue.",
};

/** Not available, or reserved but flagged for re-checking. */
function needsAttention(result: EquipmentAvailabilityResult) {
  return result.status !== "available" || Boolean(result.reservation?.needsRecheck);
}

function EventCard({
  event,
  results,
  orphanedReservations,
  onReleaseOrphan,
  rowError,
  onAction,
  onRecheck,
}: {
  event: EventEquipmentAvailability;
  /** The event's items in the selected tab; the header still summarises them all. */
  results: EquipmentAvailabilityResult[];
  /** Reservations whose request was removed; they still hold stock until released. */
  orphanedReservations: OrphanedReservation[];
  onReleaseOrphan: (reservation: OrphanedReservation) => void;
  rowError?: { requirementId: string; message: string };
  onAction: (action: PendingAction["action"], result: EquipmentAvailabilityResult) => void;
  onRecheck: (result: EquipmentAvailabilityResult) => void;
}) {
  const reservationsAllowed = isEquipmentReservationAllowed(event.status);
  const shortCount = event.results.filter(needsAttention).length;
  const reservedCount = event.results.filter((result) => result.reservation).length;
  const worst = overallEquipmentAvailability(event.results.map((result) => result.status));
  // A flagged reservation needs attention even when the items are available.
  const tone: EquipmentAvailabilityStatus =
    shortCount === 0 ? "available" : worst && worst !== "available" ? worst : "partially_available";

  return (
    <li aria-label={event.title} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-slate-950">{event.title}</h3>
            <StatusBadge status={event.status} />
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
            <CalendarDays aria-hidden="true" className="size-4" />
            {formatPeriod(event.startsAt, event.endsAt)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", statusStyles[tone])}>
            {shortCount === 0
              ? "All equipment available"
              : `${shortCount} of ${event.results.length} item${event.results.length === 1 ? "" : "s"} need attention`}
          </span>
          <span className="text-xs text-slate-500">
            {reservedCount} of {event.results.length} reserved
          </span>
        </div>
      </div>
      <ul className="divide-y divide-slate-100">
        {results.map((result) => (
          <ResultRow
            key={result.requirementId}
            result={result}
            reservationsAllowed={reservationsAllowed}
            error={rowError?.requirementId === result.requirementId ? rowError.message : undefined}
            onAction={(action) => onAction(action, result)}
            onRecheck={() => onRecheck(result)}
          />
        ))}
        {orphanedReservations.map((reservation) => (
          <OrphanedReservationRow
            key={reservation.id}
            reservation={reservation}
            onRelease={() => onReleaseOrphan(reservation)}
          />
        ))}
      </ul>
    </li>
  );
}

function ResultRow({
  result,
  reservationsAllowed,
  error,
  onAction,
  onRecheck,
}: {
  result: EquipmentAvailabilityResult;
  /** False while the event awaits its safety check: the database refuses reserving, changing and re-checking. */
  reservationsAllowed: boolean;
  error?: string;
  onAction: (action: PendingAction["action"]) => void;
  onRecheck: () => void;
}) {
  const shortage = equipmentShortage(result);
  const { reservation } = result;
  // The check leaves an item's own reservation out of its figures, so a
  // reserved item doesn't report itself as short. What's still free in the
  // pool counts it: a reservation covers its request's whole period, so it
  // adds to the busiest moment exactly.
  const ownReserved = reservation?.quantity ?? 0;
  const poolReserved = result.reservedQuantity + ownReserved;
  const poolAvailable = Math.max(result.availableQuantity - ownReserved, 0);
  const canReserve =
    !reservation && result.status !== "unknown" && result.availableQuantity > 0 && !result.itemRetired;

  return (
    <li className="grid gap-3 px-5 py-4 text-sm sm:grid-cols-[1fr_auto] sm:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-900">
            {result.equipmentName} × {result.requestedQuantity}
          </span>
          {result.itemCode && (
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
              {result.itemCode}
            </span>
          )}
          {result.itemRetired && (
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
              Retired
            </span>
          )}
          {result.arrangement ? (
            <ArrangementBadge arrangement={result.arrangement} />
          ) : (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
              Arrangement status unavailable
            </span>
          )}
        </div>
        <p className="mt-1 text-slate-600">{formatPeriod(result.requiredFrom, result.requiredUntil)}</p>
        {result.technicalRequirements && (
          <p className="mt-1 text-slate-600">
            <span className="font-medium text-slate-700">Technical requirements:</span>{" "}
            {result.technicalRequirements}
          </p>
        )}
        {result.status !== "unknown" && (
          <p className="mt-1 text-xs text-slate-500">
            {result.totalUnits} in service · {poolReserved} reserved ·{" "}
            {result.unavailableQuantity} out of service during this period
          </p>
        )}
        {reservation && (
          <div
            className={cn(
              "mt-2 rounded-lg border px-3 py-2",
              reservation.needsRecheck ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50",
            )}
          >
            <p className="font-medium text-slate-900">
              Reserved {reservation.quantity} of {result.requestedQuantity}
              {reservation.reservedByName ? ` by ${reservation.reservedByName}` : ""}
              {reservation.reservedAt ? ` · ${dateFormat.format(new Date(reservation.reservedAt))}` : ""}
            </p>
            {reservation.needsRecheck && (
              <p className="mt-0.5 text-amber-900">
                Needs re-check: {reservation.recheckReason ?? "the request changed"}
              </p>
            )}
          </div>
        )}
        {result.arrangement && <ArrangementDetails arrangement={result.arrangement} />}
        {error && (
          <p role="alert" className="mt-2 text-red-700">
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-col items-start gap-1 sm:items-end">
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", statusStyles[result.status])}>
          {equipmentAvailabilityStatusLabels[result.status]}
        </span>
        {result.status === "unknown" ? (
          <span className="text-xs text-slate-500">Not in the catalogue — check manually</span>
        ) : (
          <>
            <span className="text-slate-900">
              <span className="font-semibold">{poolAvailable}</span> available
            </span>
            {reservation && (
              <span className="text-xs text-slate-500">{reservation.quantity} reserved for this event</span>
            )}
            {shortage !== null && shortage > 0 && !reservation && (
              <span className="font-medium text-red-700">Short by {shortage}</span>
            )}
          </>
        )}
        <div className="mt-1 flex flex-wrap justify-end gap-1.5">
          {result.arrangement && (
            <Button type="button" size="sm" variant="outline" onClick={() => onAction("arrangement")}>
              Update arrangement
            </Button>
          )}
          {!reservationsAllowed && (canReserve || reservation) && (
            <span className="max-w-56 text-right text-xs text-slate-500">
              Can't reserve or change while the event awaits its safety check
            </span>
          )}
          {reservationsAllowed && canReserve && (
            <Button type="button" size="sm" onClick={() => onAction("reserve")}>
              Reserve
            </Button>
          )}
          {reservationsAllowed && reservation?.needsRecheck && (
            <Button type="button" size="sm" onClick={onRecheck}>
              Re-check
            </Button>
          )}
          {reservationsAllowed && reservation && (
            <Button type="button" size="sm" variant="outline" onClick={() => onAction("change")}>
              Change
            </Button>
          )}
          {/* Releasing gives units back, so it stays open whatever the event's status. */}
          {reservation && (
            <Button type="button" size="sm" variant="ghost" onClick={() => onAction("release")}>
              Release
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * A reservation whose request was removed: it still holds stock, so staff
 * see it here and can release it. Changing or re-checking it isn't
 * possible without a request (change_equipment_reservation refuses).
 */
function OrphanedReservationRow({
  reservation,
  onRelease,
}: {
  reservation: OrphanedReservation;
  onRelease: () => void;
}) {
  return (
    <li className="grid gap-3 bg-amber-50/60 px-5 py-4 text-sm sm:grid-cols-[1fr_auto] sm:items-start">
      <div className="min-w-0">
        <span className="font-medium text-slate-900">
          {reservation.equipmentName} × {reservation.quantity} reserved
        </span>
        <p className="mt-1 text-slate-600">{formatPeriod(reservation.startsAt, reservation.endsAt)}</p>
        <p className="mt-1 text-amber-900">
          Needs re-check: {reservation.recheckReason ?? "The equipment request was removed"}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          Still held from the available pool until released
          {reservation.reservedByName ? ` · reserved by ${reservation.reservedByName}` : ""}
          {reservation.reservedAt ? ` · ${dateFormat.format(new Date(reservation.reservedAt))}` : ""}
        </p>
      </div>
      <div className="flex flex-col items-start gap-1 sm:items-end">
        <Button type="button" size="sm" variant="outline" onClick={onRelease}>
          Release
        </Button>
      </div>
    </li>
  );
}
