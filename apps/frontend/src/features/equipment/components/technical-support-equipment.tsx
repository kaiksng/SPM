import {
  equipmentUnavailabilityStatus,
  equipmentUnitLabel,
  type EquipmentItemFormValues,
  type EquipmentUnavailabilityFormValues,
} from "@spm/shared";
import { Boxes, ChevronRight, CircleAlert, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { EquipmentInventory } from "@/features/equipment/components/equipment-inventory";
import { EquipmentUnavailabilityForm } from "@/features/equipment/components/equipment-unavailability-form";
import {
  EquipmentUnavailabilityHistory,
  type UnavailabilityFilter,
} from "@/features/equipment/components/equipment-unavailability-history";
import {
  addEquipmentUnits,
  createEquipmentItem,
  endEquipmentUnavailability,
  listEquipmentUnavailability,
  listInventory,
  recordEquipmentUnavailability,
  removeEquipmentUnavailability,
  setEquipmentItemRetired,
  setEquipmentUnitRetired,
  updateEquipmentItem,
  type EquipmentUnavailabilityRecord,
  type InventoryItem,
} from "@/features/equipment/services/equipment-unavailability";
import { useStableCallback } from "@/features/equipment/hooks/use-stable-callback";
import { currentOutages } from "@/features/equipment/utils/inventory-status";
import { Modal } from "@/features/event-requests/components/modal";
import { cn } from "@/lib/utils";

type Tab = "inventory" | "unavailability";

/** The Technical Support Staff view of the Equipment page. */
export function TechnicalSupportEquipment() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [records, setRecords] = useState<EquipmentUnavailabilityRecord[]>([]);
  const [tab, setTab] = useState<Tab>("inventory");
  const [historyFilter, setHistoryFilter] = useState<UnavailabilityFilter>("all");
  const [recording, setRecording] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const refresh = useCallback(async () => {
    const [inventory, history] = await Promise.all([listInventory(), listEquipmentUnavailability()]);
    setItems(inventory);
    setRecords(history);
  }, []);

  useEffect(() => {
    let active = true;
    refresh()
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "We couldn't load equipment.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refresh]);

  // Runs a write, then reloads. A failed write throws to the caller (which
  // shows the error next to the control); a failed reload is reported here
  // without pretending the write failed.
  async function write(action: () => Promise<unknown>, message: string) {
    await action();
    setError(undefined);
    setNotice(message);
    try {
      await refresh();
    } catch {
      setError("Saved, but the page could not be refreshed. Reload this page.");
    }
  }

  if (loading) {
    return <p role="status" className="mt-8 text-sm text-slate-500">Loading equipment…</p>;
  }

  const { recordByUnit, quantityByItem } = currentOutages(records);
  const activeItems = items.filter((item) => !item.retiredAt);
  const outNow = activeItems.reduce(
    (sum, item) => sum + Math.min(quantityByItem.get(item.id) ?? 0, item.totalQuantity),
    0,
  );
  const upcomingOrCurrent = records.filter((record) => {
    const status = equipmentUnavailabilityStatus(record);
    return status === "upcoming" || status === "in_progress";
  }).length;

  const unitLabelById = new Map<string, string>();
  for (const item of items) {
    for (const unit of item.units) unitLabelById.set(unit.id, equipmentUnitLabel(item.code, unit.unitNumber));
  }

  return (
    <>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <SummaryCard icon={<Boxes />} label="Equipment types" value={activeItems.length} />
        <SummaryCard
          icon={<CircleAlert />}
          label="Out of service now"
          value={outNow}
          tone={outNow > 0 ? "warn" : undefined}
          actionLabel="View records in progress"
          onClick={() => {
            setTab("unavailability");
            setHistoryFilter("in_progress");
            requestAnimationFrame(() => historyRef.current?.scrollIntoView?.({ behavior: "smooth" }));
          }}
        />
      </div>

      {(error || notice) && (
        <p
          role={error ? "alert" : "status"}
          className={`mt-5 rounded-xl px-4 py-3 text-sm ${error ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}
        >
          {error || notice}
        </p>
      )}

      <div role="tablist" aria-label="Equipment sections" className="mt-7 flex gap-1 border-b border-slate-200">
        <TabButton active={tab === "inventory"} onClick={() => setTab("inventory")}>
          Inventory
        </TabButton>
        <TabButton active={tab === "unavailability"} onClick={() => setTab("unavailability")}>
          Unavailability
          {upcomingOrCurrent > 0 && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {upcomingOrCurrent}
            </span>
          )}
        </TabButton>
      </div>

      {tab === "inventory" ? (
        <section role="tabpanel" aria-label="Inventory" className="mt-5">
          <EquipmentInventory
            items={items}
            records={records}
            outageByUnit={recordByUnit}
            outQuantityByItem={quantityByItem}
            onCreateItem={(values: EquipmentItemFormValues, units: number) =>
              write(() => createEquipmentItem(values, units), `${values.name.trim()} added.`)
            }
            onUpdateItem={(itemId, values) => write(() => updateEquipmentItem(itemId, values), "Equipment updated.")}
            onSetItemRetired={(itemId, retired) =>
              write(
                () => setEquipmentItemRetired(itemId, retired),
                retired ? "Equipment retired. It is no longer offered for new events." : "Equipment restored.",
              )
            }
            onAddUnits={(itemId, count) =>
              write(() => addEquipmentUnits(itemId, count), `${count} unit${count === 1 ? "" : "s"} added.`)
            }
            onSetUnitRetired={(unitId, retired) =>
              write(
                () => setEquipmentUnitRetired(unitId, retired),
                `${unitLabelById.get(unitId) ?? "Unit"} ${retired ? "retired" : "restored"}.`,
              )
            }
            onRecordUnavailable={(values) =>
              write(() => recordEquipmentUnavailability(values), "Unavailability recorded.")
            }
          />
        </section>
      ) : (
        <section role="tabpanel" aria-label="Unavailability" className="mt-5">
          <div ref={historyRef} className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Unavailability records</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Repairs, maintenance and losses. Unavailable units are excluded from event planning for the period.
                </p>
              </div>
              <Button type="button" onClick={() => setRecording(true)}>
                <Plus /> Record unavailability
              </Button>
            </div>
            <EquipmentUnavailabilityHistory
              records={records}
              unitLabelById={unitLabelById}
              filter={historyFilter}
              onFilterChange={setHistoryFilter}
              onEnd={(id) => write(() => endEquipmentUnavailability(id), "Equipment returned to service.")}
              onRemove={(id) => write(() => removeEquipmentUnavailability(id), "Record removed.")}
            />
          </div>
        </section>
      )}

      {recording && (
        <RecordUnavailabilityDialog
          items={items}
          records={records}
          onClose={() => setRecording(false)}
          onSave={async (values) => {
            await write(() => recordEquipmentUnavailability(values), "Unavailability recorded.");
            setRecording(false);
          }}
        />
      )}
    </>
  );
}

/** The SPM-30 form, opened from the "Record unavailability" button. */
function RecordUnavailabilityDialog({
  items,
  records,
  onClose,
  onSave,
}: {
  items: InventoryItem[];
  records: EquipmentUnavailabilityRecord[];
  onClose: () => void;
  onSave: (values: EquipmentUnavailabilityFormValues) => Promise<void>;
}) {
  const close = useStableCallback(onClose);
  return (
    <Modal titleId="record-unavailability-title" title="Record equipment as unavailable" onCancel={close} size="large">
      <EquipmentUnavailabilityForm items={items} records={records} onSave={onSave} />
    </Modal>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  tone,
  actionLabel,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: "good" | "warn";
  /** Makes the card a button that opens the matching records. */
  actionLabel?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-xl [&_svg]:size-5",
          tone === "good" && "bg-emerald-50 text-emerald-700",
          tone === "warn" && "bg-amber-50 text-amber-700",
          !tone && "bg-accent text-primary",
        )}
      >
        {icon}
      </span>
      <div className="flex-1 text-left">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
      </div>
      {onClick && <ChevronRight aria-hidden="true" className="size-5 text-slate-400" />}
    </>
  );
  const cardClass = "flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4";

  return onClick ? (
    <button
      type="button"
      aria-label={`${label}: ${value}. ${actionLabel ?? ""}`}
      onClick={onClick}
      className={cn(cardClass, "transition-colors hover:border-primary/40 hover:bg-accent/40")}
    >
      {content}
    </button>
  ) : (
    <div className={cardClass}>{content}</div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
        active ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-800",
      )}
    >
      {children}
    </button>
  );
}
