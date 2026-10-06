import {
  canEndEquipmentUnavailability,
  canRemoveEquipmentUnavailability,
  equipmentUnavailabilityStatus,
  equipmentUnavailabilityStatusLabels,
  type EquipmentUnavailabilityStatus,
} from "@spm/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useStableCallback } from "@/features/equipment/hooks/use-stable-callback";
import { Modal } from "@/features/event-requests/components/modal";
import type { EquipmentUnavailabilityRecord } from "@/features/equipment/services/equipment-unavailability";
import { cn } from "@/lib/utils";

const dateFormat = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

const statusStyles: Record<EquipmentUnavailabilityStatus, string> = {
  upcoming: "bg-sky-100 text-sky-800",
  in_progress: "bg-amber-100 text-amber-800",
  ended_early: "bg-emerald-100 text-emerald-800",
  past: "bg-slate-100 text-slate-600",
  removed: "bg-slate-200 text-slate-600",
};

type PendingAction = { kind: "end" | "remove"; record: EquipmentUnavailabilityRecord };

export type UnavailabilityFilter = "all" | "in_progress" | "upcoming" | "finished" | "removed";

const filterLabels: Record<UnavailabilityFilter, string> = {
  all: "All",
  in_progress: "In progress",
  upcoming: "Upcoming",
  finished: "Finished",
  removed: "Removed",
};

function matchesFilter(status: EquipmentUnavailabilityStatus, filter: UnavailabilityFilter) {
  if (filter === "all") return true;
  if (filter === "finished") return status === "past" || status === "ended_early";
  return status === filter;
}

/** AC05/AC06: every record, with who/when, and End or Remove where allowed. */
export function EquipmentUnavailabilityHistory({
  records,
  unitLabelById,
  filter,
  onFilterChange,
  onEnd,
  onRemove,
}: {
  records: EquipmentUnavailabilityRecord[];
  filter: UnavailabilityFilter;
  onFilterChange: (filter: UnavailabilityFilter) => void;
  /** unit id -> "mic-3", for records that name specific units. */
  unitLabelById: ReadonlyMap<string, string>;
  onEnd: (id: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [pending, setPending] = useState<PendingAction>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const closeDialog = useStableCallback(() => {
    if (!busy) setPending(undefined);
  });

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setError(undefined);
    try {
      await (pending.kind === "end" ? onEnd : onRemove)(pending.record.id);
      setPending(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This record could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  if (records.length === 0) {
    return <p className="mt-4 text-sm text-slate-500">No equipment has been recorded as unavailable.</p>;
  }

  const now = new Date();
  const counts = Object.fromEntries(
    (Object.keys(filterLabels) as UnavailabilityFilter[]).map((key) => [
      key,
      records.filter((record) => matchesFilter(equipmentUnavailabilityStatus(record, now), key)).length,
    ]),
  ) as Record<UnavailabilityFilter, number>;
  const visible = records.filter((record) =>
    matchesFilter(equipmentUnavailabilityStatus(record, now), filter),
  );

  return (
    <>
      <div role="group" aria-label="Filter records" className="mt-4 flex flex-wrap gap-1.5">
        {(Object.keys(filterLabels) as UnavailabilityFilter[]).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => onFilterChange(key)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filter === key
                ? "border-primary bg-primary text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100",
            )}
          >
            {filterLabels[key]} {counts[key]}
          </button>
        ))}
      </div>
      {visible.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">No records match this filter.</p>
      )}
      <ul className="mt-2 divide-y divide-slate-100">
        {visible.map((record) => {
          const status = equipmentUnavailabilityStatus(record, now);
          const cancelled = status === "removed";
          return (
            <li key={record.id} className="flex flex-wrap items-start justify-between gap-4 py-4">
              <div className="min-w-0 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("font-medium text-slate-900", cancelled && "text-slate-400 line-through")}>
                    {record.equipmentName} × {record.quantity}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-semibold",
                      statusStyles[status],
                    )}
                  >
                    {equipmentUnavailabilityStatusLabels[status]}
                  </span>
                </div>
                <div className={cn(cancelled && "text-slate-400 line-through [&_p]:text-slate-400")}>
                <p className="mt-1 text-slate-700">{record.reason}</p>
                {record.unitIds.length > 0 && (
                  <p className="mt-1 font-mono text-xs text-slate-600">
                    Units:{" "}
                    {record.unitIds
                      .map((id) => unitLabelById.get(id) ?? "unknown unit")
                      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
                      .join(", ")}
                  </p>
                )}
                <p className="mt-1 text-slate-600">
                  {dateFormat.format(new Date(record.startsAt))} –{" "}
                  {dateFormat.format(new Date(record.endsAt))}
                </p>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Recorded {dateFormat.format(new Date(record.recordedAt))}
                  {record.recordedByName ? ` by ${record.recordedByName}` : ""}
                </p>
                {record.endedAt && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    Returned to service {dateFormat.format(new Date(record.endedAt))}
                    {record.endedByName ? ` by ${record.endedByName}` : ""}
                  </p>
                )}
                {record.removedAt && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    Removed {dateFormat.format(new Date(record.removedAt))}
                    {record.removedByName ? ` by ${record.removedByName}` : ""}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                {canEndEquipmentUnavailability(status) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setError(undefined);
                      setPending({ kind: "end", record });
                    }}
                  >
                    End now
                  </Button>
                )}
                {canRemoveEquipmentUnavailability(status) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      setError(undefined);
                      setPending({ kind: "remove", record });
                    }}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {pending && (
        <Modal
          titleId="unavailability-action-title"
          title={pending.kind === "end" ? "Return to service now?" : "Remove this record?"}
          onCancel={closeDialog}
        >
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {pending.kind === "end"
              ? "The equipment counts as available again from now. The record stays in the history."
              : "The record will no longer reduce availability. It stays in the history as removed."}
          </p>
          <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900">
            {pending.record.equipmentName} × {pending.record.quantity} · {pending.record.reason}
          </p>
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setPending(undefined)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={pending.kind === "end" ? "default" : "destructive"}
              disabled={busy}
              onClick={() => void confirm()}
            >
              {busy ? "Saving…" : pending.kind === "end" ? "End now" : "Remove"}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
