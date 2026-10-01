import { useState } from "react";

import { useRoomLayoutOptions } from "@/features/venues/hooks/use-room-layout-options";
import { cn } from "@/lib/utils";

/**
 * A venue can support several existing layouts and add a new named layout.
 */
export function RoomLayoutsEditor({
  value,
  onChange,
  invalid,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  invalid?: boolean;
}) {
  const options = useRoomLayoutOptions();
  const [newLayout, setNewLayout] = useState("");
  const visibleOptions = [...new Set([...options, ...value])];

  function toggleLayout(layout: string) {
    onChange(
      value.includes(layout)
        ? value.filter((selected) => selected !== layout)
        : [...value, layout],
    );
  }

  function addLayout() {
    const label = newLayout.trim();
    if (!label || value.some((item) => item.toLowerCase() === label.toLowerCase())) return;
    onChange([...value, label]);
    setNewLayout("");
  }

  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        invalid ? "border-red-600" : "border-slate-200",
      )}
    >
      <div className="flex flex-wrap gap-1.5">
        {visibleOptions.map((layout) => {
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
                  ? "border-primary bg-primary text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-500 hover:border-primary/50 hover:text-primary",
              )}
            >
              {layout}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          aria-label="New room layout"
          value={newLayout}
          maxLength={120}
          onChange={(event) => setNewLayout(event.target.value)}
          className="border-input min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
          placeholder="e.g. U-shape"
        />
        <button type="button" onClick={addLayout} disabled={!newLayout.trim()} className="rounded-lg border border-primary px-3 py-2 text-sm font-medium text-primary disabled:opacity-50">Add layout</button>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        {value.length === 0 ? "Select at least one." : value.join(", ")}
      </p>
    </div>
  );
}
