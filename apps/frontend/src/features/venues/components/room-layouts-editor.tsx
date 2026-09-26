import { ROOM_LAYOUT_TYPES, type RoomLayoutType } from "@spm/shared";

import { cn } from "@/lib/utils";

/**
 * A venue's supported room layouts: a fixed list (not free text like
 * Facilities) so find_matching_venues' layout_notes match against
 * venue_layouts.layout_name is reliable. A venue can support more than one
 * — a hall set up as a Theatre for one event may work as a Banquet for
 * another — so this is a toggle-button picker (like OperatingHoursEditor's
 * day picker) rather than a single-choice dropdown.
 */
export function RoomLayoutsEditor({
  value,
  onChange,
  invalid,
}: {
  value: RoomLayoutType[];
  onChange: (next: RoomLayoutType[]) => void;
  invalid?: boolean;
}) {
  function toggleLayout(layout: RoomLayoutType) {
    onChange(
      value.includes(layout)
        ? value.filter((selected) => selected !== layout)
        : [...value, layout],
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        invalid ? "border-red-600" : "border-slate-200",
      )}
    >
      <div className="flex flex-wrap gap-1.5">
        {ROOM_LAYOUT_TYPES.map((layout) => {
          const selected = value.includes(layout);
          return (
            <button
              key={layout}
              type="button"
              onClick={() => toggleLayout(layout)}
              aria-pressed={selected}
              className={cn(
                "rounded-[10px] border px-3.5 py-2 text-xs font-semibold transition",
                selected
                  ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-500 hover:border-blue-300 hover:text-blue-600",
              )}
            >
              {layout}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        {value.length === 0 ? "Select at least one." : value.join(", ")}
      </p>
    </div>
  );
}
