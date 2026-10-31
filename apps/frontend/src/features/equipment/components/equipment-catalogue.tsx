import { Boxes } from "lucide-react";
import type { ReactNode } from "react";

import { ActiveFilterChips } from "@/components/ui/active-filter-chips";
import { Button } from "@/components/ui/button";
import {
  countActiveEquipmentFilters,
  emptyEquipmentFilters,
  equipmentFilterChips,
  EquipmentFiltersPanel,
  type EquipmentFilterValues,
} from "@/features/equipment/components/equipment-filters";
import type { EquipmentCatalogueItem } from "@/features/equipment/services/equipment-inventory";
import { ListToolbar } from "@/features/workspace/components/list-toolbar";
import { cn } from "@/lib/utils";

/**
 * The read-only catalogue coordinators and organisers browse: name, category
 * and in-service quantity only — no per-unit detail, since RLS
 * keeps that Technical Support Staff-only (see EquipmentCatalogueItem).
 */
export function EquipmentCatalogue({
  items,
  searchQuery,
  onSearchChange,
  filters,
  onFiltersChange,
  action,
}: {
  items: EquipmentCatalogueItem[];
  searchQuery: string;
  onSearchChange: (value: string) => void;
  filters: EquipmentFilterValues;
  onFiltersChange: (value: EquipmentFilterValues) => void;
  action?: ReactNode;
}) {
  const categories = [...new Set(items.map((item) => item.category ?? "Other"))].sort();
  const search = searchQuery.trim().toLowerCase();
  const visible = items.filter(
    (item) =>
      (filters.showRetired || !item.retiredAt) &&
      (!filters.category || (item.category ?? "Other") === filters.category) &&
      (!search ||
        item.name.toLowerCase().includes(search) ||
        item.code.includes(search) ||
        (item.category ?? "").toLowerCase().includes(search)),
  );

  const groups = new Map<string, EquipmentCatalogueItem[]>();
  for (const item of visible) {
    const key = item.category ?? "Other";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return (
    <div>
      <ListToolbar
        searchPlaceholder="Search equipment"
        searchValue={searchQuery}
        onSearchChange={onSearchChange}
        filters={null}
        action={action}
      />
      <EquipmentFiltersPanel value={filters} onChange={onFiltersChange} categories={categories} />
      <ActiveFilterChips chips={equipmentFilterChips(filters, onFiltersChange)} />

      {items.length === 0 ? (
        <EmptyCatalogue />
      ) : visible.length === 0 ? (
        <NoMatchingEquipment
          filtersActive={countActiveEquipmentFilters(filters) > 0}
          onClearFilters={() => onFiltersChange(emptyEquipmentFilters)}
        />
      ) : (
        <div className="mt-7 space-y-6">
          {[...groups].map(([group, groupItems]) => (
            <section key={group} aria-label={group}>
              <h3 className="text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">{group}</h3>
              <ul className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {groupItems.map((item) => (
                  <li
                    key={item.id}
                    className={cn(
                      "rounded-xl border border-slate-200 bg-white p-4",
                      item.retiredAt && "bg-slate-50",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
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
                    </div>
                    <p className="mt-1.5 text-sm text-slate-500">{item.totalQuantity} in service</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyCatalogue() {
  return (
    <section className="mt-7 grid min-h-80 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
      <div className="max-w-sm py-12">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent text-primary">
          <Boxes aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-lg font-semibold text-slate-950">No equipment yet</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Equipment will show up here once it&apos;s added to the system.
        </p>
      </div>
    </section>
  );
}

function NoMatchingEquipment({
  filtersActive,
  onClearFilters,
}: {
  filtersActive: boolean;
  onClearFilters: () => void;
}) {
  return (
    <section className="mt-7 grid min-h-80 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
      <div className="max-w-sm py-12">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent text-primary">
          <Boxes aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-lg font-semibold text-slate-950">No matching equipment</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Try a different search term{filtersActive ? " or adjust your filters" : ""}.
        </p>
        {filtersActive && (
          <Button type="button" variant="outline" className="mt-5" onClick={onClearFilters}>
            Clear filters
          </Button>
        )}
      </div>
    </section>
  );
}
