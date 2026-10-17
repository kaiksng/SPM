import { LOCATION_AREAS } from "@spm/shared";
import { ChevronDown } from "lucide-react";

import { AmenityPicker } from "@/components/ui/amenity-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

/** The catalogue's filter control, a <details> disclosure matching AmenityPicker's convention. */
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
    <details className="rounded-lg border border-input bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700">
        Filters{activeCount > 0 ? ` (${activeCount})` : ""}
        <ChevronDown className="size-4" aria-hidden="true" />
      </summary>
      <div className="grid w-80 gap-4 border-t border-input p-4 sm:w-96">
        <div>
          <label htmlFor="venue-filter-area" className="mb-1 block text-sm font-medium text-slate-700">
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

        <div>
          <label htmlFor="venue-filter-capacity" className="mb-1 block text-sm font-medium text-slate-700">
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
        />

        <div>
          <label htmlFor="venue-filter-layout" className="mb-1 block text-sm font-medium text-slate-700">
            Room layout
          </label>
          <select
            id="venue-filter-layout"
            value={value.layout}
            onChange={(event) => update("layout", event.target.value)}
            className="border-input h-8 w-full rounded-lg border bg-white px-2.5 text-sm"
          >
            <option value="">Any layout</option>
            {roomLayouts.map((layout) => (
              <option key={layout} value={layout}>
                {layout}
              </option>
            ))}
          </select>
        </div>

        {activeCount > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={() => onChange(emptyVenueFilters)}>
            Clear filters
          </Button>
        )}
      </div>
    </details>
  );
}
