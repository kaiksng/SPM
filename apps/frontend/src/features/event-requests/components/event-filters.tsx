import type { FilterChip } from "@/components/ui/active-filter-chips";
import { FilterSection } from "@/components/ui/filter-section";
import { PillToggleGroup } from "@/components/ui/pill-toggle-group";
import { eventStatusLabel } from "@/features/event-requests/components/status-badges";

export type EventFilterValues = {
  status: string;
  dateFrom: string;
  dateTo: string;
};

export const emptyEventFilters: EventFilterValues = {
  status: "",
  dateFrom: "",
  dateTo: "",
};

export function countActiveEventFilters(filters: EventFilterValues): number {
  return (
    (filters.status ? 1 : 0) +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0)
  );
}

export function eventFilterChips(
  filters: EventFilterValues,
  onChange: (value: EventFilterValues) => void,
): FilterChip[] {
  const chips: FilterChip[] = [];
  if (filters.status) {
    chips.push({
      key: "status",
      label: eventStatusLabel(filters.status),
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
  if (filters.dateTo) {
    chips.push({
      key: "dateTo",
      label: `To ${filters.dateTo}`,
      onRemove: () => onChange({ ...filters, dateTo: "" }),
    });
  }
  return chips;
}

/** An events list's filter control, an always-visible section below the search toolbar. */
export function EventFiltersPanel({
  value,
  onChange,
  statusOptions,
}: {
  value: EventFilterValues;
  onChange: (value: EventFilterValues) => void;
  /** The distinct statuses actually present in this view's loaded events. */
  statusOptions: string[];
}) {
  const activeCount = countActiveEventFilters(value);

  function update<K extends keyof EventFilterValues>(key: K, next: EventFilterValues[K]) {
    onChange({ ...value, [key]: next });
  }

  return (
    <FilterSection activeCount={activeCount} onClear={() => onChange(emptyEventFilters)}>
      <PillToggleGroup
        label="Status"
        value={value.status}
        onChange={(status) => update("status", status)}
        options={statusOptions.map((status) => ({ value: status, label: eventStatusLabel(status) }))}
        anyLabel="All status"
      />

      <div className="w-40">
        <label htmlFor="event-filter-from" className="mb-1.5 block text-sm font-medium text-slate-700">
          From
        </label>
        <input
          id="event-filter-from"
          type="date"
          value={value.dateFrom}
          onChange={(event) => update("dateFrom", event.target.value)}
          className="border-input h-8 w-full rounded-lg border bg-white px-2.5 text-sm"
        />
      </div>

      <div className="w-40">
        <label htmlFor="event-filter-to" className="mb-1.5 block text-sm font-medium text-slate-700">
          To
        </label>
        <input
          id="event-filter-to"
          type="date"
          value={value.dateTo}
          onChange={(event) => update("dateTo", event.target.value)}
          className="border-input h-8 w-full rounded-lg border bg-white px-2.5 text-sm"
        />
      </div>
    </FilterSection>
  );
}
