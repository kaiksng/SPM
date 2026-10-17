import { X } from "lucide-react";

export type FilterChip = { key: string; label: string; onRemove: () => void };

/** Shows what's filtered without opening the Filters panel, each removable on its own. */
export function ActiveFilterChips({ chips }: { chips: FilterChip[] }) {
  if (chips.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onRemove}
          aria-label={`Remove ${chip.label} filter`}
          className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200"
        >
          {chip.label}
          <X className="size-3" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
