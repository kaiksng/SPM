import type { DayCode, OperatingHours, OperatingHoursPeriod } from "@spm/shared";

import { cn } from "@/lib/utils";

const DAYS: { code: DayCode; label: string; full: string }[] = [
  { code: "mon", label: "Mon", full: "Monday" },
  { code: "tue", label: "Tue", full: "Tuesday" },
  { code: "wed", label: "Wed", full: "Wednesday" },
  { code: "thu", label: "Thu", full: "Thursday" },
  { code: "fri", label: "Fri", full: "Friday" },
  { code: "sat", label: "Sat", full: "Saturday" },
  { code: "sun", label: "Sun", full: "Sunday" },
];

const DEFAULT_PERIOD: OperatingHoursPeriod = {
  days: [],
  opensAt: "09:00",
  closesAt: "18:00",
};

/**
 * A venue's operating hours: one set of open days sharing one opens/closes
 * time — not several ranges (that was tried and rejected as unneeded
 * complexity). Storage stays a length-1 array (matches
 * public.venues.operating_hours's jsonb shape); this component always
 * edits `value[0]`, falling back to an empty default if the array is empty
 * (e.g. a venue created before this field existed).
 */
export function OperatingHoursEditor({
  value,
  onChange,
}: {
  value: OperatingHours;
  onChange: (next: OperatingHours) => void;
}) {
  const period = value[0] ?? DEFAULT_PERIOD;
  const closedDays = DAYS.filter((day) => !period.days.includes(day.code));

  function update(patch: Partial<OperatingHoursPeriod>) {
    onChange([{ ...period, ...patch }]);
  }

  function toggleDay(day: DayCode) {
    update({
      days: period.days.includes(day)
        ? period.days.filter((d) => d !== day)
        : [...period.days, day],
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-4">
      <div>
        <p className="mb-2 text-xs font-medium text-slate-600">
          Open on which days?
        </p>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((day) => {
            const selected = period.days.includes(day.code);
            return (
              <button
                key={day.code}
                type="button"
                onClick={() => toggleDay(day.code)}
                aria-pressed={selected}
                title={day.full}
                className={cn(
                  "min-w-13 rounded-[10px] border px-3.5 py-2 text-xs font-semibold transition",
                  selected
                    ? "border-primary bg-primary text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-500 hover:border-primary/50 hover:text-primary",
                )}
              >
                {day.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Opens</span>
          <input
            type="time"
            value={period.opensAt}
            onChange={(event) => update({ opensAt: event.target.value })}
            className="border-input rounded-lg border bg-transparent px-2.5 py-1.5 text-sm shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Closes</span>
          <input
            type="time"
            value={period.closesAt}
            onChange={(event) => update({ closesAt: event.target.value })}
            className="border-input rounded-lg border bg-transparent px-2.5 py-1.5 text-sm shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>
      </div>

      <p className="text-xs text-slate-500">
        {closedDays.length === 0
          ? "Open every day."
          : `Closed: ${closedDays.map((day) => day.label).join(", ")}`}
      </p>
    </div>
  );
}
