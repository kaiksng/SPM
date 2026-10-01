import { VENUE_AMENITIES } from "@spm/shared";

import { cn } from "@/lib/utils";

/** Keeps saved legacy tags visible until a user deliberately removes them. */
export function AmenityPicker({
  value,
  onChange,
  label = "Required facilities",
  disabled = false,
  error,
  className,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  label?: string;
  disabled?: boolean;
  error?: string;
  className?: string;
}) {
  const legacy = value.filter(
    (item) => !VENUE_AMENITIES.some((amenity) => amenity.toLowerCase() === item.toLowerCase()),
  );

  function toggle(item: string, checked: boolean) {
    onChange(checked ? [...value, item] : value.filter((selected) => selected !== item));
  }

  return (
    <fieldset className={cn("min-w-0", className)} disabled={disabled} aria-invalid={Boolean(error)}>
      <legend className="mb-2 text-sm font-medium text-slate-900">{label}</legend>
      <details className="rounded-lg border border-input bg-white">
        <summary className="cursor-pointer px-3 py-2 text-sm text-slate-700">
          Select facilities ({value.length} selected)
        </summary>
        <div className="grid max-h-64 gap-2 overflow-y-auto border-t border-input p-3 sm:grid-cols-2">
        {VENUE_AMENITIES.map((amenity) => (
          <label key={amenity} className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={value.includes(amenity)}
              onChange={(event) => toggle(amenity, event.target.checked)}
              className="size-4 accent-primary"
            />
            {amenity}
          </label>
        ))}
        {legacy.map((item) => (
          <label key={item} className="flex items-center gap-2 text-sm text-amber-800">
            <input
              type="checkbox"
              checked
              onChange={() => toggle(item, false)}
              className="size-4 accent-primary"
            />
            {item} (previously saved)
          </label>
        ))}
        </div>
      </details>
      {error && <p role="alert" className="mt-1.5 text-sm text-red-700">{error}</p>}
    </fieldset>
  );
}
