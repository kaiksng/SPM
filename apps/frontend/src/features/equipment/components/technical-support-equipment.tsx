import { equipmentUnavailabilityStatus, type EquipmentUnavailabilityFormValues } from "@spm/shared";
import { useCallback, useEffect, useState } from "react";

import { EquipmentStockTable } from "@/features/equipment/components/equipment-stock-table";
import { EquipmentUnavailabilityForm } from "@/features/equipment/components/equipment-unavailability-form";
import { EquipmentUnavailabilityHistory } from "@/features/equipment/components/equipment-unavailability-history";
import {
  endEquipmentUnavailability,
  listEquipmentUnavailability,
  listStockedEquipment,
  recordEquipmentUnavailability,
  removeEquipmentUnavailability,
  updateEquipmentStock,
  type EquipmentUnavailabilityRecord,
  type StockedEquipmentItem,
} from "@/features/equipment/services/equipment-unavailability";

/** The Technical Support Staff view of the Equipment page (SPM-30). */
export function TechnicalSupportEquipment() {
  const [items, setItems] = useState<StockedEquipmentItem[]>([]);
  const [records, setRecords] = useState<EquipmentUnavailabilityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const refresh = useCallback(async () => {
    const [catalogue, history] = await Promise.all([
      listStockedEquipment(),
      listEquipmentUnavailability(),
    ]);
    setItems(catalogue);
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

  // Reloads after a successful write; a failed reload is reported without
  // pretending the write itself failed.
  async function afterWrite(message: string) {
    setError(undefined);
    setNotice(message);
    try {
      await refresh();
    } catch {
      setError("Saved, but the page could not be refreshed. Reload this page.");
    }
  }

  const now = new Date();
  const unavailableNow = new Map<string, number>();
  for (const record of records) {
    if (equipmentUnavailabilityStatus(record, now) === "in_progress") {
      unavailableNow.set(
        record.equipmentItemId,
        (unavailableNow.get(record.equipmentItemId) ?? 0) + record.quantity,
      );
    }
  }

  if (loading) {
    return <p role="status" className="mt-8 text-sm text-slate-500">Loading equipment…</p>;
  }

  return (
    <>
      {(error || notice) && (
        <p
          role={error ? "alert" : "status"}
          className={`mt-5 rounded-xl px-4 py-3 text-sm ${error ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}
        >
          {error || notice}
        </p>
      )}

      <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <h2 className="text-lg font-semibold text-slate-950">Catalogue and stock</h2>
        <p className="mt-1 text-sm text-slate-500">
          Total units held for each item. Availability checks use these totals.
        </p>
        <EquipmentStockTable
          items={items}
          unavailableNow={unavailableNow}
          onSaveStock={async (itemId, totalQuantity) => {
            await updateEquipmentStock(itemId, totalQuantity);
            await afterWrite("Stock updated.");
          }}
        />
      </section>

      <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <h2 className="text-lg font-semibold text-slate-950">Record equipment as unavailable</h2>
        <p className="mt-1 text-sm text-slate-500">
          For repairs, maintenance or loss. Unavailable units are excluded from event planning for the period.
        </p>
        <EquipmentUnavailabilityForm
          items={items}
          records={records}
          onSave={async (values: EquipmentUnavailabilityFormValues) => {
            await recordEquipmentUnavailability(values);
            await afterWrite("Unavailability recorded.");
          }}
        />
      </section>

      <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <h2 className="text-lg font-semibold text-slate-950">Unavailability records</h2>
        <EquipmentUnavailabilityHistory
          records={records}
          onEnd={async (id) => {
            await endEquipmentUnavailability(id);
            await afterWrite("Equipment returned to service.");
          }}
          onRemove={async (id) => {
            await removeEquipmentUnavailability(id);
            await afterWrite("Record removed.");
          }}
        />
      </section>
    </>
  );
}
