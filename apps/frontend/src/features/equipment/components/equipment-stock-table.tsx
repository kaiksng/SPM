import { equipmentStockSchema } from "@spm/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { StockedEquipmentItem } from "@/features/equipment/services/equipment-unavailability";

/**
 * Each catalogue item's total stock, editable in place, alongside how many
 * units are out of service right now (SPM-30). SPM-31 checks availability
 * against these totals.
 */
export function EquipmentStockTable({
  items,
  unavailableNow,
  onSaveStock,
}: {
  items: StockedEquipmentItem[];
  unavailableNow: ReadonlyMap<string, number>;
  onSaveStock: (itemId: string, totalQuantity: number) => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string>();

  async function save(item: StockedEquipmentItem) {
    const value = drafts[item.id] ?? String(item.totalQuantity);
    const parsed = equipmentStockSchema.safeParse(value);
    if (!parsed.success) {
      setErrors({ ...errors, [item.id]: parsed.error.issues[0]?.message ?? "Enter a whole number" });
      return;
    }
    setErrors({ ...errors, [item.id]: "" });
    setSavingId(item.id);
    try {
      await onSaveStock(item.id, Number(parsed.data));
      setDrafts((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    } catch (cause) {
      setErrors({
        ...errors,
        [item.id]: cause instanceof Error ? cause.message : "The stock could not be updated.",
      });
    } finally {
      setSavingId(undefined);
    }
  }

  if (items.length === 0) {
    return <p className="mt-4 text-sm text-slate-500">The equipment catalogue is empty.</p>;
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead className="text-xs font-medium text-slate-500">
          <tr className="border-b border-slate-200">
            <th className="py-2 pr-4 font-medium">Equipment</th>
            <th className="py-2 pr-4 font-medium">Category</th>
            <th className="py-2 pr-4 font-medium">Total stock</th>
            <th className="py-2 font-medium">Unavailable now</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => {
            const draft = drafts[item.id];
            const changed = draft !== undefined && draft !== String(item.totalQuantity);
            const out = unavailableNow.get(item.id) ?? 0;
            return (
              <tr key={item.id}>
                <td className="py-3 pr-4 font-medium text-slate-900">{item.name}</td>
                <td className="py-3 pr-4 text-slate-600">{item.category ?? "Other"}</td>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      aria-label={`Total stock for ${item.name}`}
                      aria-invalid={Boolean(errors[item.id])}
                      className="w-24"
                      value={draft ?? String(item.totalQuantity)}
                      onChange={(event) =>
                        setDrafts({ ...drafts, [item.id]: event.target.value })
                      }
                    />
                    {changed && (
                      <Button
                        type="button"
                        size="sm"
                        disabled={savingId === item.id}
                        onClick={() => void save(item)}
                      >
                        {savingId === item.id ? "Saving…" : "Save"}
                      </Button>
                    )}
                  </div>
                  {errors[item.id] && (
                    <p role="alert" className="mt-1 text-xs text-red-700">
                      {errors[item.id]}
                    </p>
                  )}
                </td>
                <td className="py-3">
                  {out > 0 ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                      {out} out of service
                    </span>
                  ) : (
                    <span className="text-slate-400">None</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
