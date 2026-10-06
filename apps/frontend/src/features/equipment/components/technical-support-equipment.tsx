import {
  equipmentUnavailabilityStatus,
  equipmentUnitLabel,
  type EquipmentItemFormValues,
  type EquipmentUnavailabilityFormValues,
} from "@spm/shared";
import { Boxes, CircleCheck, CircleAlert, Archive } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { EquipmentInventory } from "@/features/equipment/components/equipment-inventory";
import { EquipmentUnavailabilityForm } from "@/features/equipment/components/equipment-unavailability-form";
import { EquipmentUnavailabilityHistory } from "@/features/equipment/components/equipment-unavailability-history";
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
import { currentOutages } from "@/features/equipment/utils/inventory-status";
import { cn } from "@/lib/utils";

type Tab = "inventory" | "unavailability";

/** The Technical Support Staff view of the Equipment page. */
export function TechnicalSupportEquipment() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [records, setRecords] = useState<EquipmentUnavailabilityRecord[]>([]);
  const [tab, setTab] = useState<Tab>("inventory");
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
  const unitsInService = activeItems.reduce((sum, item) => sum + item.totalQuantity, 0);
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
      <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard icon={<Boxes />} label="Equipment types" value={activeItems.length} />
        <SummaryCard icon={<CircleCheck />} label="Available now" value={unitsInService - outNow} tone="good" />
        <SummaryCard icon={<CircleAlert />} label="Out of service now" value={outNow} tone={outNow > 0 ? "warn" : undefined} />
        <SummaryCard icon={<Archive />} label="Retired types" value={items.length - activeItems.length} />
      </dl>

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
          />
        </section>
      ) : (
        <section role="tabpanel" aria-label="Unavailability" className="mt-5 space-y-7">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
            <h2 className="text-lg font-semibold text-slate-950">Record equipment as unavailable</h2>
            <p className="mt-1 text-sm text-slate-500">
              For repairs, maintenance or loss. Unavailable units are excluded from event planning for the period.
            </p>
            <EquipmentUnavailabilityForm
              items={items}
              records={records}
              onSave={(values: EquipmentUnavailabilityFormValues) =>
                write(() => recordEquipmentUnavailability(values), "Unavailability recorded.")
              }
            />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
            <h2 className="text-lg font-semibold text-slate-950">Unavailability records</h2>
            <EquipmentUnavailabilityHistory
              records={records}
              unitLabelById={unitLabelById}
              onEnd={(id) => write(() => endEquipmentUnavailability(id), "Equipment returned to service.")}
              onRemove={(id) => write(() => removeEquipmentUnavailability(id), "Record removed.")}
            />
          </div>
        </section>
      )}
    </>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: "good" | "warn";
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
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
      <div>
        <dt className="text-xs font-medium text-slate-500">{label}</dt>
        <dd className="text-2xl font-semibold tracking-tight text-slate-950">{value}</dd>
      </div>
    </div>
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
