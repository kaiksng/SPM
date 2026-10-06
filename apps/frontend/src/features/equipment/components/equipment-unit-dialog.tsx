import { equipmentUnitLabel, type EquipmentUnavailabilityFormValues } from "@spm/shared";
import { CalendarX2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { EquipmentUnavailabilityForm } from "@/features/equipment/components/equipment-unavailability-form";
import { useStableCallback } from "@/features/equipment/hooks/use-stable-callback";
import type {
  EquipmentUnavailabilityRecord,
  EquipmentUnit,
  InventoryItem,
} from "@/features/equipment/services/equipment-unavailability";
import { Modal } from "@/features/event-requests/components/modal";
import { cn } from "@/lib/utils";

const dateFormat = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

/**
 * One physical unit: its status, and the two things staff do with it —
 * record it as unavailable for a period, or retire (restore) it.
 */
export function EquipmentUnitDialog({
  item,
  unit,
  items,
  records,
  outage,
  onClose,
  onRecordUnavailable,
  onSetRetired,
}: {
  item: InventoryItem;
  unit: EquipmentUnit;
  items: InventoryItem[];
  records: EquipmentUnavailabilityRecord[];
  /** The in-progress record this unit is out on, if any. */
  outage?: EquipmentUnavailabilityRecord;
  onClose: () => void;
  onRecordUnavailable: (values: EquipmentUnavailabilityFormValues) => Promise<void>;
  onSetRetired: (retired: boolean) => Promise<void>;
}) {
  const [mode, setMode] = useState<"details" | "unavailable" | "confirm_retire">("details");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const close = useStableCallback(() => {
    if (!busy) onClose();
  });

  const label = equipmentUnitLabel(item.code, unit.unitNumber);
  const status = unit.retiredAt ? "Retired" : outage ? "Out of service" : "In service";

  async function toggleRetired() {
    setBusy(true);
    setError(undefined);
    try {
      await onSetRetired(!unit.retiredAt);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This unit could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      titleId="equipment-unit-dialog-title"
      title={`${label} · ${item.name}`}
      onCancel={close}
      size={mode === "unavailable" ? "large" : "default"}
    >
      {mode === "details" ? (
        <>
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <p className="flex items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-semibold",
                  status === "In service" && "bg-emerald-100 text-emerald-800",
                  status === "Out of service" && "bg-amber-100 text-amber-800",
                  status === "Retired" && "bg-slate-200 text-slate-600",
                )}
              >
                {status}
              </span>
              <span className="text-slate-500">{item.category ?? "Other"}</span>
            </p>
            {outage && (
              <p className="mt-2 text-slate-700">
                {outage.reason} · until {dateFormat.format(new Date(outage.endsAt))}
              </p>
            )}
            {unit.retiredAt && (
              <p className="mt-2 text-slate-700">
                Retired {dateFormat.format(new Date(unit.retiredAt))}. It no longer counts as stock.
              </p>
            )}
          </div>

          {error && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
              Close
            </Button>
            {!unit.retiredAt && (
              <Button type="button" variant="outline" disabled={busy} onClick={() => setMode("unavailable")}>
                <CalendarX2 /> Mark unavailable
              </Button>
            )}
            <Button
              type="button"
              variant={unit.retiredAt ? "default" : "destructive"}
              disabled={busy}
              onClick={() => (unit.retiredAt ? void toggleRetired() : setMode("confirm_retire"))}
            >
              {busy ? "Saving…" : unit.retiredAt ? "Restore unit" : "Retire unit"}
            </Button>
          </div>
        </>
      ) : mode === "confirm_retire" ? (
        <>
          <p className="mt-3 text-sm font-semibold text-slate-900">Retire {label}?</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {label} will stop counting as stock and can't be chosen for outages. It stays listed as
            retired, and you can restore it later.
          </p>
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setMode("details")}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={busy} onClick={() => void toggleRetired()}>
              {busy ? "Retiring…" : `Retire ${label}`}
            </Button>
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            className="text-sm font-medium text-primary hover:underline"
            onClick={() => setMode("details")}
          >
            ← Back to {label}
          </button>
          <EquipmentUnavailabilityForm
            items={items}
            records={records}
            initialValues={{ equipmentItemId: item.id, unitIds: [unit.id] }}
            submitLabel={`Mark ${label} unavailable`}
            onSave={async (values) => {
              await onRecordUnavailable(values);
              onClose();
            }}
          />
        </>
      )}
    </Modal>
  );
}
