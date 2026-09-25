import { ROOM_LAYOUT_TYPES, type RoomLayoutType } from "@spm/shared";

import { cn } from "@/lib/utils";

/**
 * A venue's one supported room layout: a fixed list (not free text like
 * Facilities) so find_matching_venues' layout_notes match against
 * venue_layouts.layout_name is reliable. A dropdown, not a chip picker,
 * since only one choice is ever valid (mirrors operatingHoursSchema's
 * single-period cap).
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
  const selectedLayout = value[0] ?? "";

  return (
    <select
      value={selectedLayout}
      onChange={(event) => {
        const next = event.target.value as RoomLayoutType | "";
        onChange(next ? [next] : []);
      }}
      aria-invalid={invalid}
      className={cn(
        "border-input flex h-8 w-full min-w-0 rounded-lg border bg-transparent px-2.5 text-sm shadow-xs transition-[color,box-shadow] outline-none",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "aria-invalid:border-red-600 aria-invalid:ring-3 aria-invalid:ring-red-200",
        !selectedLayout && "text-muted-foreground",
      )}
    >
      <option value="" disabled>
        Select a room layout
      </option>
      {ROOM_LAYOUT_TYPES.map((layout) => (
        <option key={layout} value={layout} className="text-foreground">
          {layout}
        </option>
      ))}
    </select>
  );
}
