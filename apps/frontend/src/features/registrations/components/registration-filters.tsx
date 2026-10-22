import type { FilterChip } from "@/components/ui/active-filter-chips";
import { FilterSection } from "@/components/ui/filter-section";
import { PillToggleGroup } from "@/components/ui/pill-toggle-group";

export type RegistrationFilterValues = {
  status: string;
  dateFrom: string;
};

export const emptyRegistrationFilters: RegistrationFilterValues = {
  status: "",
  dateFrom: "",
};

export function countActiveRegistrationFilters(filters: RegistrationFilterValues): number {
  return (filters.status ? 1 : 0) + (filters.dateFrom ? 1 : 0);
}

export function registrationFilterChips(
  filters: RegistrationFilterValues,
  statusLabel: (value: string) => string,
  onChange: (value: RegistrationFilterValues) => void,
): FilterChip[] {
  const chips: FilterChip[] = [];
  if (filters.status) {
    chips.push({
      key: "status",
      label: statusLabel(filters.status),
      onRemove: () => onChange({ ...filters, status: "" }),
    });
  }
  if (filters.dateFrom) {
    chips.push({
      key: "dateFrom",
      label: `From ${filters.dateFrom}`,
      onRemove: () => onChange({ ...filters, dateFrom: "" }),
    });
  }
  return chips;
}

/**
 * The status + "from date" filter panel shared by Browse Events and My
 * Registrations — same FilterSection/PillToggleGroup pattern as Events,
 * Venues and Equipment, so it looks and behaves like every other filter
 * panel in the app rather than a one-off.
 */
export function RegistrationFiltersPanel({
  value,
  onChange,
  statusOptions,
}: {
  value: RegistrationFilterValues;
  onChange: (value: RegistrationFilterValues) => void;
  statusOptions: { value: string; label: string }[];
}) {
  const activeCount = countActiveRegistrationFilters(value);

  function update<K extends keyof RegistrationFilterValues>(
    key: K,
    next: RegistrationFilterValues[K],
  ) {
    onChange({ ...value, [key]: next });
  }

  return (
    <FilterSection activeCount={activeCount} onClear={() => onChange(emptyRegistrationFilters)}>
      <PillToggleGroup
        label="Status"
        value={value.status}
        onChange={(status) => update("status", status)}
        options={statusOptions}
        anyLabel="All"
      />

      <div className="w-40">
        <label
          htmlFor="registration-filter-from"
          className="mb-1.5 block text-sm font-medium text-slate-700"
        >
          From
        </label>
        <input
          id="registration-filter-from"
          type="date"
          value={value.dateFrom}
          onChange={(event) => update("dateFrom", event.target.value)}
          className="border-input h-8 w-full rounded-lg border bg-white px-2.5 text-sm"
        />
      </div>
    </FilterSection>
  );
}
