import {
  equipmentAvailabilityStatusLabels,
  equipmentShortage,
  overallEquipmentAvailability,
  type EquipmentAvailabilityStatus,
} from "@spm/shared";
import { CalendarDays, Search } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import type {
  EquipmentAvailabilityResult,
  EventEquipmentAvailability,
} from "@/features/equipment/services/equipment-availability";
import { StatusBadge } from "@/features/event-requests/components/status-badges";
import { cn } from "@/lib/utils";

const dateFormat = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

const statusStyles: Record<EquipmentAvailabilityStatus, string> = {
  available: "bg-emerald-100 text-emerald-800",
  partially_available: "bg-amber-100 text-amber-800",
  unavailable: "bg-red-100 text-red-800",
  unknown: "bg-slate-200 text-slate-700",
};

function formatPeriod(from: string | null, until: string | null) {
  if (!from || !until) return "No period recorded";
  return `${dateFormat.format(new Date(from))} – ${dateFormat.format(new Date(until))}`;
}

/** SPM-31: each open event's requested equipment against what can be provided. */
export function EventEquipmentAvailabilityList({ events }: { events: EventEquipmentAvailability[] }) {
  const [query, setQuery] = useState("");
  const [shortagesOnly, setShortagesOnly] = useState(false);

  const search = query.trim().toLowerCase();
  const visible = events.filter((event) => {
    if (search && !event.title.toLowerCase().includes(search)) return false;
    if (shortagesOnly) {
      const overall = overallEquipmentAvailability(event.results.map((result) => result.status));
      return overall !== "available";
    }
    return true;
  });

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
          />
          <Input
            type="search"
            aria-label="Search events"
            placeholder="Search by event name"
            className="pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={shortagesOnly}
            onChange={(event) => setShortagesOnly(event.target.checked)}
          />
          Only events with a shortage
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
          {events.length === 0
            ? "No open events have requested equipment."
            : "No events match your filters."}
        </p>
      ) : (
        <ul className="mt-5 space-y-4">
          {visible.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </ul>
      )}
    </div>
  );
}

function EventCard({ event }: { event: EventEquipmentAvailability }) {
  const overall = overallEquipmentAvailability(event.results.map((result) => result.status));
  const shortCount = event.results.filter((result) => result.status !== "available").length;

  return (
    <li aria-label={event.title} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-slate-950">{event.title}</h3>
            <StatusBadge status={event.status} />
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
            <CalendarDays aria-hidden="true" className="size-4" />
            {formatPeriod(event.startsAt, event.endsAt)}
          </p>
        </div>
        {overall && (
          <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", statusStyles[overall])}>
            {overall === "available"
              ? "All equipment available"
              : `${shortCount} of ${event.results.length} item${event.results.length === 1 ? "" : "s"} need attention`}
          </span>
        )}
      </div>
      <ul className="divide-y divide-slate-100">
        {event.results.map((result) => (
          <ResultRow key={result.requirementId} result={result} />
        ))}
      </ul>
    </li>
  );
}

function ResultRow({ result }: { result: EquipmentAvailabilityResult }) {
  const shortage = equipmentShortage(result);

  return (
    <li className="grid gap-3 px-5 py-4 text-sm sm:grid-cols-[1fr_auto] sm:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-900">
            {result.equipmentName} × {result.requestedQuantity}
          </span>
          {result.itemCode && (
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
              {result.itemCode}
            </span>
          )}
          {result.itemRetired && (
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
              Retired
            </span>
          )}
        </div>
        <p className="mt-1 text-slate-600">{formatPeriod(result.requiredFrom, result.requiredUntil)}</p>
        {result.technicalRequirements && (
          <p className="mt-1 text-slate-600">
            <span className="font-medium text-slate-700">Technical requirements:</span>{" "}
            {result.technicalRequirements}
          </p>
        )}
        {result.status !== "unknown" && (
          <p className="mt-1 text-xs text-slate-500">
            {result.totalUnits} in service · {result.reservedQuantity} reserved ·{" "}
            {result.unavailableQuantity} out of service during this period
          </p>
        )}
      </div>
      <div className="flex flex-col items-start gap-1 sm:items-end">
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", statusStyles[result.status])}>
          {equipmentAvailabilityStatusLabels[result.status]}
        </span>
        {result.status === "unknown" ? (
          <span className="text-xs text-slate-500">Not in the catalogue — check manually</span>
        ) : (
          <>
            <span className="text-slate-900">
              <span className="font-semibold">{result.availableQuantity}</span> available
            </span>
            {shortage !== null && shortage > 0 && (
              <span className="font-medium text-red-700">Short by {shortage}</span>
            )}
          </>
        )}
      </div>
    </li>
  );
}
