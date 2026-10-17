import { LOCATION_AREAS } from "@spm/shared";

import { AmenityPicker } from "@/components/ui/amenity-picker";
import type { FilterChip } from "@/components/ui/active-filter-chips";
import { FilterSection } from "@/components/ui/filter-section";
import { Input } from "@/components/ui/input";
import { PillToggleGroup } from "@/components/ui/pill-toggle-group";
import { useRoomLayoutOptions } from "@/features/venues/hooks/use-room-layout-options";

export type VenueFilterValues = {
  area: string;
  minCapacity: string;
  facilities: string[];
  layout: string;
};

export const emptyVenueFilters: VenueFilterValues = {
  area: "",
  minCapacity: "",
  facilities: [],
  layout: "",
};

export function countActiveVenueFilters(filters: VenueFilterValues): number {
  return (
    (filters.area ? 1 : 0) +
    (filters.minCapacity ? 1 : 0) +
    (filters.facilities.length > 0 ? 1 : 0) +
    (filters.layout ? 1 : 0)
  );
}

/** One removable chip per active filter — a facility chip per selected facility, not one combined chip. */
export function venueFilterChips(
  filters: VenueFilterValues,
  onChange: (value: VenueFilterValues) => void,
): FilterChip[] {
  const chips: FilterChip[] = [];
  if (filters.area) {
    chips.push({ key: "area", label: filters.area, onRemove: () => onChange({ ...filters, area: "" }) });
  }
  if (filters.minCapacity) {
    chips.push({
      key: "minCapacity",
      label: `Capacity ≥ ${filters.minCapacity}`,
      onRemove: () => onChange({ ...filters, minCapacity: "" }),
    });
  }
  for (const facility of filters.facilities) {
    chips.push({
      key: `facility-${facility}`,
      label: facility,
      onRemove: () => onChange({ ...filters, facilities: filters.facilities.filter((f) => f !== facility) }),
    });
  }
  if (filters.layout) {
    chips.push({ key: "layout", label: filters.layout, onRemove: () => onChange({ ...filters, layout: "" }) });
  }
  return chips;
}

/** The catalogue's filter control, an always-visible section below the search toolbar. */
export function VenueFiltersPanel({
  value,
  onChange,
}: {
  value: VenueFilterValues;
  onChange: (value: VenueFilterValues) => void;
}) {
  const roomLayouts = useRoomLayoutOptions();
  const activeCount = countActiveVenueFilters(value);

  function update<K extends keyof VenueFilterValues>(key: K, next: VenueFilterValues[K]) {
    onChange({ ...value, [key]: next });
  }

  return (
    <FilterSection activeCount={activeCount} onClear={() => onChange(emptyVenueFilters)}>
      <div className="w-44">
        <label htmlFor="venue-filter-area" className="mb-1.5 block text-sm font-medium text-slate-700">
          Area
        </label>
        <select
          id="venue-filter-area"
          value={value.area}
          onChange={(event) => update("area", event.target.value)}
          className="border-input h-8 w-full rounded-lg border bg-white px-2.5 text-sm"
        >
          <option value="">Any area</option>
          {LOCATION_AREAS.map((area) => (
            <option key={area} value={area}>
              {area}
            </option>
          ))}
        </select>
      </div>

      <div className="w-40">
        <label htmlFor="venue-filter-capacity" className="mb-1.5 block text-sm font-medium text-slate-700">
          Minimum capacity
        </label>
        <Input
          id="venue-filter-capacity"
          type="number"
          min={0}
          value={value.minCapacity}
          onChange={(event) => update("minCapacity", event.target.value)}
        />
      </div>

      <AmenityPicker
        value={value.facilities}
        onChange={(facilities) => update("facilities", facilities)}
        className="w-64"
      />

      <PillToggleGroup
        label="Room layout"
        value={value.layout}
        onChange={(layout) => update("layout", layout)}
        options={roomLayouts.map((layout) => ({ value: layout, label: layout }))}
        anyLabel="All layout"
      />
    </FilterSection>
  );
}
