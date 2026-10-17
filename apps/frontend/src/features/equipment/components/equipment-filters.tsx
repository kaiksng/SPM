import type { FilterChip } from "@/components/ui/active-filter-chips";
import { FilterSection } from "@/components/ui/filter-section";
import { PillToggleGroup } from "@/components/ui/pill-toggle-group";

export type EquipmentFilterValues = {
  category: string;
  showRetired: boolean;
};

export const emptyEquipmentFilters: EquipmentFilterValues = {
  category: "",
  showRetired: false,
};

export function countActiveEquipmentFilters(filters: EquipmentFilterValues): number {
  return (filters.category ? 1 : 0) + (filters.showRetired ? 1 : 0);
}

export function equipmentFilterChips(
  filters: EquipmentFilterValues,
  onChange: (value: EquipmentFilterValues) => void,
): FilterChip[] {
  const chips: FilterChip[] = [];
  if (filters.category) {
    chips.push({
      key: "category",
      label: filters.category,
      onRemove: () => onChange({ ...filters, category: "" }),
    });
  }
  if (filters.showRetired) {
    chips.push({
      key: "showRetired",
      label: "Showing retired",
      onRemove: () => onChange({ ...filters, showRetired: false }),
    });
  }
  return chips;
}

/** The inventory's filter control, an always-visible section below the search toolbar. */
export function EquipmentFiltersPanel({
  value,
  onChange,
  categories,
}: {
  value: EquipmentFilterValues;
  onChange: (value: EquipmentFilterValues) => void;
  categories: string[];
}) {
  const activeCount = countActiveEquipmentFilters(value);

  function update<K extends keyof EquipmentFilterValues>(key: K, next: EquipmentFilterValues[K]) {
    onChange({ ...value, [key]: next });
  }

  return (
    <FilterSection activeCount={activeCount} onClear={() => onChange(emptyEquipmentFilters)}>
      <PillToggleGroup
        label="Category"
        value={value.category}
        onChange={(category) => update("category", category)}
        options={categories.map((category) => ({ value: category, label: category }))}
        anyLabel="All categories"
      />

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={value.showRetired}
          onChange={(event) => update("showRetired", event.target.checked)}
        />
        Show retired
      </label>
    </FilterSection>
  );
}
