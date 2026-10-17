import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

/**
 * An always-visible filter block — a bordered section below the search
 * toolbar, not a dropdown/disclosure — shared by the Venues, Equipment and
 * Events filter panels.
 */
export function FilterSection({
  activeCount,
  onClear,
  children,
}: {
  activeCount: number;
  onClear: () => void;
  children: ReactNode;
}) {
  return (
    <section aria-label="Filters" className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
          Filters{activeCount > 0 ? ` (${activeCount})` : ""}
        </h2>
        {activeCount > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        )}
      </div>
      {/* items-end: each field is a label stacked above its control, so
          aligning by the bottom edge keeps every control on one line
          regardless of label height (e.g. AmenityPicker's legend). */}
      <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-4">{children}</div>
    </section>
  );
}
