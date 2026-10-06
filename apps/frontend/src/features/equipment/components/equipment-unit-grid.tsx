import { equipmentUnitCountSchema, equipmentUnitLabel } from "@spm/shared";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  EquipmentUnavailabilityRecord,
  EquipmentUnit,
  InventoryItem,
} from "@/features/equipment/services/equipment-unavailability";
import { cn } from "@/lib/utils";

type UnitFilter = "all" | "in_service" | "out" | "retired";

/**
 * Every physical unit of one item (mic-1 … mic-100) with its status. Click a
 * unit to open it (mark unavailable, retire, restore); add more units at the
 * bottom.
 */
export function EquipmentUnitGrid({
  item,
  outageByUnit,
  onAddUnits,
  onSelectUnit,
  onMarkUnavailable,
  selectionResetKey,
}: {
  item: InventoryItem;
  outageByUnit: ReadonlyMap<string, EquipmentUnavailabilityRecord>;
  onAddUnits: (count: number) => Promise<void>;
  onSelectUnit: (unit: EquipmentUnit) => void;
  /** Opens the unavailability form for several units at once. */
  onMarkUnavailable: (unitIds: string[]) => void;
  /** Changes after a bulk save, so the finished selection is cleared. */
  selectionResetKey: number;
}) {
  const [filter, setFilter] = useState<UnitFilter>("all");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string>();
  const [count, setCount] = useState("1");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const statusOf = (unit: EquipmentUnit): Exclude<UnitFilter, "all"> =>
    unit.retiredAt ? "retired" : outageByUnit.has(unit.id) ? "out" : "in_service";
  const counts = { in_service: 0, out: 0, retired: 0 };
  for (const unit of item.units) counts[statusOf(unit)] += 1;

  const visible = item.units.filter((unit) => filter === "all" || statusOf(unit) === filter);
  // Retired units cannot be marked unavailable, so they cannot be selected.
  const selectable = (unit: EquipmentUnit) => !unit.retiredAt;

  // Click toggles one unit; shift-click selects everything between the last
  // clicked unit and this one (in the order shown).
  function toggle(unit: EquipmentUnit, range: boolean) {
    const next = new Set(selected);
    const anchorIndex = visible.findIndex((candidate) => candidate.id === anchorId);
    const index = visible.findIndex((candidate) => candidate.id === unit.id);
    if (range && anchorIndex >= 0) {
      const [from, to] = anchorIndex < index ? [anchorIndex, index] : [index, anchorIndex];
      for (const candidate of visible.slice(from, to + 1)) {
        if (selectable(candidate)) next.add(candidate.id);
      }
    } else if (next.has(unit.id)) {
      next.delete(unit.id);
    } else {
      next.add(unit.id);
    }
    setSelected(next);
    setAnchorId(unit.id);
  }

  function stopSelecting() {
    setSelecting(false);
    setSelected(new Set());
    setAnchorId(undefined);
  }

  // Once the selected units have been marked unavailable, the selection is
  // done: leave selection mode so they show their new (out) status.
  useEffect(() => {
    if (selectionResetKey > 0) stopSelecting();
  }, [selectionResetKey]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This change could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function addUnits(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = equipmentUnitCountSchema.safeParse(count);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    await run(async () => {
      await onAddUnits(Number(parsed.data));
      setCount("1");
    });
  }

  const filters: Array<[UnitFilter, string]> = [
    ["all", `All ${item.units.length}`],
    ["in_service", `In service ${counts.in_service}`],
    ["out", `Out now ${counts.out}`],
    ["retired", `Retired ${counts.retired}`],
  ];

  return (
    <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
      <div role="group" aria-label={`Filter ${item.name} units`} className="flex flex-wrap gap-1.5">
        {filters.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filter === value
                ? "border-primary bg-primary text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100",
            )}
          >
            {label}
          </button>
        ))}
      </div>
        <Button
          type="button"
          size="sm"
          variant={selecting ? "secondary" : "outline"}
          aria-pressed={selecting}
          onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
        >
          {selecting ? "Done selecting" : "Select units"}
        </Button>
      </div>

      {selecting && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-accent/60 px-3 py-2 text-sm select-none">
          <span className="font-medium text-slate-900">{selected.size} selected</span>
          <span className="text-xs text-slate-500">Click to select · Shift-click to select a range</span>
          <span className="flex-1" />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setSelected(new Set([...selected, ...visible.filter(selectable).map((unit) => unit.id)]))}
          >
            Select all shown
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={selected.size === 0} onClick={() => setSelected(new Set())}>
            Clear
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={selected.size === 0}
            onClick={() =>
              onMarkUnavailable(
                // In unit order, so the form lists them mic-3, mic-7, …
                item.units.filter((unit) => selected.has(unit.id)).map((unit) => unit.id),
              )
            }
          >
            Mark {selected.size} unavailable
          </Button>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No units match this filter.</p>
      ) : (
        <ul
          aria-label={`${item.name} units`}
          className="mt-3 grid max-h-64 grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-1.5 overflow-y-auto pr-1"
        >
          {visible.map((unit) => {
            const status = statusOf(unit);
            const label = equipmentUnitLabel(item.code, unit.unitNumber);
            return (
              <li key={unit.id}>
                <button
                  type="button"
                  aria-pressed={selecting ? selected.has(unit.id) : undefined}
                  disabled={selecting && !selectable(unit)}
                  title={
                    status === "out"
                      ? `Out: ${outageByUnit.get(unit.id)?.reason}`
                      : status === "retired"
                        ? "Retired"
                        : "In service"
                  }
                  onClick={(event) => (selecting ? toggle(unit, event.shiftKey) : onSelectUnit(unit))}
                  className={cn(
                    "w-full rounded-lg border px-2 py-1.5 font-mono text-xs transition-colors",
                    status === "in_service" && "border-slate-200 bg-white text-slate-700 hover:border-primary/50",
                    status === "out" && "border-amber-300 bg-amber-50 text-amber-900",
                    status === "retired" && "border-slate-200 bg-slate-100 text-slate-400 line-through",
                    // Keeps the status colour (amber = out) visible while selected.
                    selecting && selected.has(unit.id) && "ring-2 ring-primary ring-offset-1 font-semibold",
                    selecting && !selectable(unit) && "cursor-not-allowed opacity-50",
                    // Shift-click should not highlight text across the grid.
                    selecting && "select-none",
                  )}
                >
                  {selecting && selected.has(unit.id) && <span aria-hidden="true">✓ </span>}
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={addUnits} noValidate className="mt-3 flex flex-wrap items-center gap-2">
        <label htmlFor={`add-units-${item.id}`} className="text-sm text-slate-600">
          Add units
        </label>
        <Input
          id={`add-units-${item.id}`}
          type="number"
          min="1"
          max="1000"
          step="1"
          className="w-24"
          value={count}
          onChange={(event) => setCount(event.target.value)}
        />
        <Button type="submit" size="sm" variant="outline" disabled={busy}>
          <Plus /> Add
        </Button>
        <span className="text-xs text-slate-500">
          New units continue from {equipmentUnitLabel(item.code, nextUnitNumber(item))}
        </span>
      </form>

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function nextUnitNumber(item: InventoryItem) {
  return item.units.reduce((highest, unit) => Math.max(highest, unit.unitNumber), 0) + 1;
}
