import { VENUE_AMENITIES } from "@spm/shared";
import { ChevronDown } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
      <Popover>
        <PopoverTrigger
          disabled={disabled}
          className="border-input flex h-8 w-full items-center justify-between gap-2 rounded-lg border bg-transparent px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="text-slate-700">Select facilities ({value.length} selected)</span>
          <ChevronDown className="text-muted-foreground size-4 shrink-0" />
        </PopoverTrigger>
        <PopoverContent className="p-0">
          <div className="grid max-h-64 w-[min(28rem,90vw)] gap-2 overflow-y-auto p-3 sm:grid-cols-2">
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
        </PopoverContent>
      </Popover>
      {error && <p role="alert" className="mt-1.5 text-sm text-red-700">{error}</p>}
    </fieldset>
  );
}
