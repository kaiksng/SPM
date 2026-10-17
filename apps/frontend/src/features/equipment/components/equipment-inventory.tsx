import type { EquipmentItemFormValues, EquipmentUnavailabilityFormValues } from "@spm/shared";
import { ChevronDown, Pencil, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

import { ActiveFilterChips } from "@/components/ui/active-filter-chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmRetireDialog } from "@/features/equipment/components/confirm-retire-dialog";
import { EquipmentItemDialog } from "@/features/equipment/components/equipment-item-dialog";
import {
  countActiveEquipmentFilters,
  emptyEquipmentFilters,
  equipmentFilterChips,
  EquipmentFiltersPanel,
  type EquipmentFilterValues,
} from "@/features/equipment/components/equipment-filters";
import { EquipmentUnavailabilityForm } from "@/features/equipment/components/equipment-unavailability-form";
import { EquipmentUnitDialog } from "@/features/equipment/components/equipment-unit-dialog";
import { EquipmentUnitGrid } from "@/features/equipment/components/equipment-unit-grid";
import type {
  EquipmentUnavailabilityRecord,
  EquipmentUnit,
  InventoryItem,
} from "@/features/equipment/services/equipment-unavailability";
import { useStableCallback } from "@/features/equipment/hooks/use-stable-callback";
import { Modal } from "@/features/event-requests/components/modal";
import { cn } from "@/lib/utils";

/**
 * The catalogue as Technical Support Staff manage it: search and filter,
 * each item's in-service / out-now counts, and an expandable list of its
 * units.
 */
export function EquipmentInventory({
  items,
  records,
  outageByUnit,
  outQuantityByItem,
  onCreateItem,
  onUpdateItem,
  onSetItemRetired,
  onAddUnits,
  onSetUnitRetired,
  onRecordUnavailable,
}: {
  items: InventoryItem[];
  records: EquipmentUnavailabilityRecord[];
  outageByUnit: ReadonlyMap<string, EquipmentUnavailabilityRecord>;
  outQuantityByItem: ReadonlyMap<string, number>;
  onCreateItem: (values: EquipmentItemFormValues, units: number) => Promise<void>;
  onUpdateItem: (itemId: string, values: EquipmentItemFormValues) => Promise<void>;
  onSetItemRetired: (itemId: string, retired: boolean) => Promise<void>;
  onAddUnits: (itemId: string, count: number) => Promise<void>;
  onSetUnitRetired: (unitId: string, retired: boolean) => Promise<void>;
  onRecordUnavailable: (values: EquipmentUnavailabilityFormValues) => Promise<void>;
}) {
  const [openUnit, setOpenUnit] = useState<{ item: InventoryItem; unit: EquipmentUnit }>();
  const [confirmRetire, setConfirmRetire] = useState<InventoryItem>();
  const [bulkUnavailable, setBulkUnavailable] = useState<{ item: InventoryItem; unitIds: string[] }>();
  const [selectionResetKey, setSelectionResetKey] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [filters, setFilters] = useState<EquipmentFilterValues>(() => ({
    category: searchParams.get("category") ?? "",
    showRetired: searchParams.get("showRetired") === "1",
  }));
  const [expandedId, setExpandedId] = useState<string>();
  const [dialog, setDialog] = useState<{ item?: InventoryItem }>();
  const [rowError, setRowError] = useState<{ itemId: string; message: string }>();

  // Kept in the URL so it's still there when the user navigates away and back.
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (filters.category) params.set("category", filters.category);
    if (filters.showRetired) params.set("showRetired", "1");
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filters]);

  const categories = [...new Set(items.map((item) => item.category ?? "Other"))].sort();
  const search = query.trim().toLowerCase();
  const visible = items.filter(
    (item) =>
      (filters.showRetired || !item.retiredAt) &&
      (!filters.category || (item.category ?? "Other") === filters.category) &&
      (!search ||
        item.name.toLowerCase().includes(search) ||
        item.code.includes(search) ||
        (item.category ?? "").toLowerCase().includes(search) ||
        // "mic-12" finds the Wireless microphone.
        search.startsWith(`${item.code}-`)),
  );

  const groups = new Map<string, InventoryItem[]>();
  for (const item of visible) {
    const key = item.category ?? "Other";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  async function toggleRetired(item: InventoryItem) {
    setRowError(undefined);
    try {
      await onSetItemRetired(item.id, !item.retiredAt);
    } catch (cause) {
      setRowError({
        itemId: item.id,
        message: cause instanceof Error ? cause.message : "This item could not be updated.",
      });
    }
  }

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
            aria-label="Search equipment"
            placeholder="Search by name, code (mic) or unit (mic-12)"
            className="pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Button type="button" onClick={() => setDialog({})}>
          <Plus /> Add equipment
        </Button>
      </div>
      <EquipmentFiltersPanel value={filters} onChange={setFilters} categories={categories} />
      <ActiveFilterChips chips={equipmentFilterChips(filters, setFilters)} />

      {visible.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center">
          <p className="text-sm text-slate-500">
            No equipment matches your search{countActiveEquipmentFilters(filters) > 0 ? " or filters" : ""}.
          </p>
          {countActiveEquipmentFilters(filters) > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setFilters(emptyEquipmentFilters)}
            >
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-5 space-y-6">
          {[...groups].map(([group, groupItems]) => (
            <section key={group} aria-label={group}>
              <h3 className="text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">
                {group}
              </h3>
              <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                {groupItems.map((item) => {
                  const out = Math.min(outQuantityByItem.get(item.id) ?? 0, item.totalQuantity);
                  const available = item.totalQuantity - out;
                  const expanded = expandedId === item.id;
                  return (
                    <li key={item.id} className={cn(item.retiredAt && "bg-slate-50")}>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-label={`${expanded ? "Hide" : "Show"} ${item.name} units`}
                          onClick={() => setExpandedId(expanded ? undefined : item.id)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <ChevronDown
                            aria-hidden="true"
                            className={cn("size-4 shrink-0 text-slate-400 transition-transform", expanded && "rotate-180")}
                          />
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className={cn("font-medium text-slate-900", item.retiredAt && "text-slate-500")}>
                                {item.name}
                              </span>
                              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
                                {item.code}
                              </span>
                              {item.retiredAt && (
                                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
                                  Retired
                                </span>
                              )}
                            </span>
                            <AvailabilityBar total={item.totalQuantity} out={out} />
                          </span>
                        </button>
                        <dl className="flex gap-5 text-sm">
                          <div>
                            <dt className="text-xs text-slate-500">Available now</dt>
                            <dd className="font-semibold text-slate-900">{available}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-500">Out now</dt>
                            <dd className={cn("font-semibold", out > 0 ? "text-amber-700" : "text-slate-400")}>
                              {out}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-500">In service</dt>
                            <dd className="font-semibold text-slate-900">{item.totalQuantity}</dd>
                          </div>
                        </dl>
                        <div className="flex gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            aria-label={`Edit ${item.name}`}
                            onClick={() => setDialog({ item })}
                          >
                            <Pencil /> Edit
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              item.retiredAt ? void toggleRetired(item) : setConfirmRetire(item)
                            }
                          >
                            {item.retiredAt ? "Restore" : "Retire"}
                          </Button>
                        </div>
                      </div>
                      {rowError?.itemId === item.id && (
                        <p role="alert" className="px-5 pb-3 text-sm text-red-700">
                          {rowError.message}
                        </p>
                      )}
                      {expanded && (
                        <EquipmentUnitGrid
                          item={item}
                          outageByUnit={outageByUnit}
                          onAddUnits={(count) => onAddUnits(item.id, count)}
                          onSelectUnit={(unit) => setOpenUnit({ item, unit })}
                          onMarkUnavailable={(unitIds) => setBulkUnavailable({ item, unitIds })}
                          selectionResetKey={selectionResetKey}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {bulkUnavailable && (
        <BulkUnavailableDialog
          item={bulkUnavailable.item}
          unitIds={bulkUnavailable.unitIds}
          items={items}
          records={records}
          onClose={() => setBulkUnavailable(undefined)}
          onSave={async (values) => {
            await onRecordUnavailable(values);
            setBulkUnavailable(undefined);
            setSelectionResetKey((key) => key + 1);
          }}
        />
      )}

      {confirmRetire && (
        <ConfirmRetireDialog
          title={`Retire ${confirmRetire.name}?`}
          description="It will no longer be offered for new events or outages. Events that already use it keep it, and you can restore it later."
          confirmLabel={`Retire ${confirmRetire.name}`}
          onCancel={() => setConfirmRetire(undefined)}
          onConfirm={async () => {
            await onSetItemRetired(confirmRetire.id, true);
            setConfirmRetire(undefined);
          }}
        />
      )}

      {openUnit && (
        <EquipmentUnitDialog
          item={openUnit.item}
          unit={openUnit.unit}
          items={items}
          records={records}
          outage={outageByUnit.get(openUnit.unit.id)}
          onClose={() => setOpenUnit(undefined)}
          onRecordUnavailable={onRecordUnavailable}
          onSetRetired={(retired) => onSetUnitRetired(openUnit.unit.id, retired)}
        />
      )}

      {dialog && (
        <EquipmentItemDialog
          item={dialog.item}
          categories={categories}
          onCancel={() => setDialog(undefined)}
          onSave={async (values, units) => {
            if (dialog.item) await onUpdateItem(dialog.item.id, values);
            else await onCreateItem(values, units);
            setDialog(undefined);
          }}
        />
      )}
    </div>
  );
}

/** The unavailability form for several units picked in the grid. */
function BulkUnavailableDialog({
  item,
  unitIds,
  items,
  records,
  onClose,
  onSave,
}: {
  item: InventoryItem;
  unitIds: string[];
  items: InventoryItem[];
  records: EquipmentUnavailabilityRecord[];
  onClose: () => void;
  onSave: (values: EquipmentUnavailabilityFormValues) => Promise<void>;
}) {
  const close = useStableCallback(onClose);
  const count = unitIds.length;
  return (
    <Modal
      titleId="bulk-unavailable-title"
      title={`Mark ${count} ${item.name} unit${count === 1 ? "" : "s"} unavailable`}
      onCancel={close}
      size="large"
    >
      <EquipmentUnavailabilityForm
        items={items}
        records={records}
        initialValues={{ equipmentItemId: item.id, unitIds }}
        submitLabel={`Mark ${count} unavailable`}
        onSave={onSave}
      />
    </Modal>
  );
}

/** In service vs out now, as a thin bar under the item name. */
function AvailabilityBar({ total, out }: { total: number; out: number }) {
  const outPercent = total > 0 ? (out / total) * 100 : 0;
  return (
    <span
      aria-hidden="true"
      className="mt-1.5 flex h-1.5 w-40 max-w-full overflow-hidden rounded-full bg-emerald-200"
    >
      {total === 0 ? (
        <span className="h-full w-full bg-slate-200" />
      ) : (
        <span className="h-full bg-amber-400" style={{ width: `${outPercent}%` }} />
      )}
    </span>
  );
}
