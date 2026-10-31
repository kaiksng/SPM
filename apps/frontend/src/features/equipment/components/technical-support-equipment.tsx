import { equipmentUnitLabel, type EquipmentItemFormValues } from "@spm/shared";
import { Boxes } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { EquipmentInventory } from "@/features/equipment/components/equipment-inventory";
import { EventEquipmentAvailabilityList } from "@/features/equipment/components/event-equipment-availability";
import {
  changeEquipmentReservation,
  listEventEquipmentAvailability,
  releaseEquipmentReservation,
  reserveEquipment,
  type EventEquipmentAvailability,
} from "@/features/equipment/services/equipment-availability";
import {
  addEquipmentUnits,
  createEquipmentItem,
  listInventory,
  setEquipmentItemRetired,
  setEquipmentUnitRetired,
  updateEquipmentItem,
  type InventoryItem,
} from "@/features/equipment/services/equipment-inventory";

/** The two Technical Support Staff sections, each its own page in the top bar. */
export type EquipmentSection = "requests" | "inventory";

/** The Technical Support Staff view of one Equipment section. */
export function TechnicalSupportEquipment({ section }: { section: EquipmentSection }) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [eventAvailability, setEventAvailability] = useState<EventEquipmentAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const refresh = useCallback(async () => {
    // Availability depends on stock, so it reloads with it.
    const [inventory, availability] = await Promise.all([listInventory(), listEventEquipmentAvailability()]);
    setItems(inventory);
    setEventAvailability(availability);
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
  async function write<T>(action: () => Promise<T>, message: string | ((result: T) => string)) {
    const result = await action();
    setError(undefined);
    setNotice(typeof message === "function" ? message(result) : message);
    try {
      await refresh();
    } catch {
      setError("Saved, but the page could not be refreshed. Reload this page.");
    }
  }

  if (loading) {
    return <p role="status" className="mt-8 text-sm text-slate-500">Loading equipment…</p>;
  }

  const activeItems = items.filter((item) => !item.retiredAt);
  const unitLabelById = new Map<string, string>();
  for (const item of items) {
    for (const unit of item.units) unitLabelById.set(unit.id, equipmentUnitLabel(item.code, unit.unitNumber));
  }

  return (
    <>
      {section === "inventory" && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <SummaryCard icon={<Boxes />} label="Equipment types" value={activeItems.length} />
        </div>
      )}

      {(error || notice) && (
        <p
          role={error ? "alert" : "status"}
          className={`mt-5 rounded-xl px-4 py-3 text-sm ${error ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}
        >
          {error || notice}
        </p>
      )}

      {section === "requests" ? (
        <section aria-label="Event requests" className="mt-6">
          <EventEquipmentAvailabilityList
            events={eventAvailability}
            onReserve={(requirementId, quantity) =>
              write(() => reserveEquipment(requirementId, quantity), "Equipment reserved.")
            }
            onChange={(reservationId, quantity) =>
              write(() => changeEquipmentReservation(reservationId, quantity), "Reservation updated.")
            }
            onRelease={(reservationId, reason) =>
              write(() => releaseEquipmentReservation(reservationId, reason), "Reservation released.")
            }
          />
        </section>
      ) : (
        <section aria-label="Inventory" className="mt-6">
          <EquipmentInventory
            items={items}
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
      )}
    </>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-primary [&_svg]:size-5"
      >
        {icon}
      </span>
      <div className="flex-1 text-left">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
      </div>
    </div>
  );
}
