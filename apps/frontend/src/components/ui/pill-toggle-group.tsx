import { cn } from "@/lib/utils";

/**
 * A single-select filter control for a small, bounded set of options —
 * faster to scan and pick from than a native <select>, used in place of one
 * wherever the option count stays small (status, category, layout). Styled
 * like the arrangement-status tabs in event-equipment-availability.tsx.
 */
export function PillToggleGroup({
  label,
  value,
  onChange,
  options,
  anyLabel = "Any",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  anyLabel?: string;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        <PillOption active={!value} label={anyLabel} onClick={() => onChange("")} />
        {options.map((option) => (
          <PillOption
            key={option.value}
            active={value === option.value}
            label={option.label}
            onClick={() => onChange(option.value)}
          />
        ))}
      </div>
    </div>
  );
}

function PillOption({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-white"
          : "border-slate-200 bg-white text-slate-600 hover:border-primary/40 hover:text-slate-900",
      )}
    >
      {label}
    </button>
  );
}
