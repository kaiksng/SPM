import { ChevronDown, Search } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * The search + Filters row shared by every workspace list page (Events,
 * Venues, Equipment). Search is wired up per-page (each page owns its own
 * filtering over data it already loaded). Filters is likewise per-page: a
 * page with a real filter control (shown as its own always-visible section
 * below this toolbar, not a dropdown) passes `filters={null}` to suppress
 * the static placeholder button entirely; omitting the prop keeps that
 * placeholder for pages that don't have filters wired up yet.
 */
export function ListToolbar({
  searchPlaceholder,
  searchValue,
  onSearchChange,
  filters,
  action,
}: {
  searchPlaceholder: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  /** Pass `null` to suppress the static placeholder button; omit to keep it. */
  filters?: ReactNode;
  /** The role-gated primary action (e.g. "Venue request"), or nothing. */
  action?: ReactNode;
}) {
  return (
    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400"
          />
          <Input
            type="search"
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            className="h-9 pl-8"
          />
        </div>
        {filters === undefined && (
          <Button type="button" variant="outline" size="sm">
            Filters <ChevronDown className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>
      {action}
    </div>
  );
}
