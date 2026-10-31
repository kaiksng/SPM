import {
  asRoomLayoutType, formatOperatingHours, isoToSingaporeLocal, LOCATION_AREAS,
  venueSearchSchema, type VenueSearchValues,
} from "@spm/shared";
import { Building2, MapPin, Search, Users } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router";

import { Button } from "@/components/ui/button";
import { AmenityPicker } from "@/components/ui/amenity-picker";
import { Input } from "@/components/ui/input";
import type { EventDetail } from "@/features/event-requests/services/event-details";
import { searchAvailableVenues } from "@/features/venues/services/venue-search";
import type { VenueSummary } from "@/features/venues/services/venues";
import { useRoomLayoutOptions } from "@/features/venues/hooks/use-room-layout-options";

export function eventSearchDefaults(event: EventDetail): VenueSearchValues {
  return {
    startsAt: event.startsAt ? isoToSingaporeLocal(event.startsAt) : "",
    endsAt: event.endsAt ? isoToSingaporeLocal(event.endsAt) : "",
    minimumCapacity: String(Math.max(event.expectedAttendance ?? 0, event.venue.minimumCapacity ?? 0) || ""),
    location: event.venue.preferredLocation ?? "",
    layout: asRoomLayoutType(event.venue.layoutNotes),
    facilities: event.venue.facilities,
    accessibility: event.venue.accessibilityNotes ?? "",
  };
}

/**
 * SPM-85: an additional venue starts from that booking's own needs, not the
 * event's total attendance: the event's period (to narrow down), no headcount
 * yet, and the main venue's area so a breakout room is found next to the hall.
 */
export function additionalSearchDefaults(event: EventDetail, defaultLocation: string): VenueSearchValues {
  return {
    startsAt: event.startsAt ? isoToSingaporeLocal(event.startsAt) : "",
    endsAt: event.endsAt ? isoToSingaporeLocal(event.endsAt) : "",
    minimumCapacity: "",
    location: defaultLocation,
    layout: "",
    facilities: [],
    accessibility: "",
  };
}

type SavedSearchState = { venueSearch?: VenueSearchValues; bookingLabel?: string; additional?: boolean };

export function ManualVenueSearch({
  event,
  hasActiveBooking,
  replacing,
  additional,
}: {
  event: EventDetail;
  hasActiveBooking: boolean;
  // SPM-82: choosing a replacement for a disrupted booking (see SuggestedVenuesPanel).
  replacing?: { bookingId: string; venueId: string };
  // SPM-85: describing an additional venue booking (label, period, headcount, needs).
  additional?: { defaultLocation: string };
}) {
  const location = useLocation();
  const savedState = location.state as SavedSearchState | null;
  const saved = Boolean(savedState?.additional) === Boolean(additional) ? savedState?.venueSearch : undefined;
  const defaults = () => (additional ? additionalSearchDefaults(event, additional.defaultLocation) : eventSearchDefaults(event));
  const [label, setLabel] = useState(() => (additional && saved ? savedState?.bookingLabel ?? "" : ""));
  const [values, setValues] = useState<VenueSearchValues>(() => saved ?? defaults());
  const [results, setResults] = useState<VenueSummary[]>();
  // SPM-82: the disrupted venue is never offered as its own replacement.
  const visibleResults = results?.filter((venue) => venue.id !== replacing?.venueId);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const roomLayouts = useRoomLayoutOptions();
  const eventDatesMatch = values.startsAt === (event.startsAt ? isoToSingaporeLocal(event.startsAt) : "")
    && values.endsAt === (event.endsAt ? isoToSingaporeLocal(event.endsAt) : "");
  // An additional booking has its own period, which must fall inside the event's.
  const insideEvent = Boolean(event.startsAt && event.endsAt)
    && values.startsAt >= isoToSingaporeLocal(event.startsAt as string)
    && values.endsAt <= isoToSingaporeLocal(event.endsAt as string);

  function update<K extends keyof VenueSearchValues>(key: K, value: VenueSearchValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setResults(undefined);
    setErrors((current) => ({ ...current, [key]: "" }));
  }

  async function search(e: React.FormEvent) {
    e.preventDefault(); setMessage("");
    if (additional) {
      if (!label.trim()) { setErrors({ label: "Give this booking a label, for example Breakout 1" }); setResults(undefined); return; }
      if (values.startsAt && values.endsAt && !insideEvent) {
        const message = "This booking's period must fall within the event's start and end time";
        const next: Record<string, string> = {};
        if (!event.startsAt || values.startsAt < isoToSingaporeLocal(event.startsAt)) next.startsAt = message;
        if (!event.endsAt || values.endsAt > isoToSingaporeLocal(event.endsAt)) next.endsAt = message;
        setErrors(next); setResults(undefined); return;
      }
    }
    const parsed = venueSearchSchema.safeParse(values);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
      setErrors(next); setResults(undefined); return;
    }
    setErrors({}); setLoading(true);
    try { setResults(await searchAvailableVenues(event.id, parsed.data)); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Venue search failed."); setResults(undefined); }
    finally { setLoading(false); }
  }

  function reset() {
    setValues(defaults());
    setResults(undefined); setErrors({}); setMessage("");
  }

  const field = (key: "startsAt" | "endsAt" | "minimumCapacity" | "accessibility", label: string, type = "text") =>
    <div><label htmlFor={`venue-search-${key}`} className="mb-1 block text-sm font-medium text-slate-700">{label}</label><Input id={`venue-search-${key}`} type={type} value={values[key]} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${key}-error` : undefined} onChange={(e) => update(key, e.target.value)} />{errors[key] && <p id={`${key}-error`} className="mt-1 text-sm text-red-700">{errors[key]}</p>}</div>;

  return <div className="mt-5">
    <p className="text-sm text-slate-600">{additional
      ? "Describe the room this booking needs. The number of people is the minimum capacity, and the period must fall within the event. Results start at the main venue's area."
      : "Adjust filters to explore available venues. This search does not change the event or its agreed requirements."}</p>
    <form onSubmit={search} noValidate className="mt-5 grid gap-4 sm:grid-cols-2">
      {additional && <div className="sm:col-span-2"><label htmlFor="venue-search-label" className="mb-1 block text-sm font-medium text-slate-700">Booking label *</label><Input id="venue-search-label" value={label} placeholder="e.g. Breakout 1" maxLength={80} aria-invalid={!!errors.label} aria-describedby={errors.label ? "label-error" : undefined} onChange={(e) => { setLabel(e.target.value); setResults(undefined); setErrors((current) => ({ ...current, label: "" })); }} />{errors.label && <p id="label-error" className="mt-1 text-sm text-red-700">{errors.label}</p>}</div>}
      {field("startsAt", "Start date and time *", "datetime-local")}
      {field("endsAt", "End date and time *", "datetime-local")}
      {field("minimumCapacity", additional ? "Number of people (minimum capacity) *" : "Minimum capacity *", "number")}
      <div><label htmlFor="venue-search-location" className="mb-1 block text-sm font-medium text-slate-700">Location</label><select id="venue-search-location" value={values.location} onChange={(e) => update("location", e.target.value)} className="border-input h-8 w-full rounded-lg border bg-white px-2.5 text-sm"><option value="">Any area</option>{values.location && !LOCATION_AREAS.includes(values.location as typeof LOCATION_AREAS[number]) && <option value={values.location}>{values.location} (previously saved)</option>}{LOCATION_AREAS.map((area) => <option key={area} value={area}>{area}</option>)}</select></div>
      <div><label htmlFor="venue-search-layout" className="mb-1 block text-sm font-medium text-slate-700">Room layout</label><select id="venue-search-layout" value={values.layout} onChange={(e) => update("layout", e.target.value as VenueSearchValues["layout"])} className="border-input h-8 w-full rounded-lg border bg-white px-2.5 text-sm focus-visible:ring-3 focus-visible:ring-ring/50"><option value="">Any layout</option>{values.layout && !roomLayouts.includes(values.layout) && <option value={values.layout}>{values.layout}</option>}{roomLayouts.map((layout) => <option key={layout} value={layout}>{layout}</option>)}</select></div>
      <AmenityPicker value={values.facilities} onChange={(facilities) => update("facilities", facilities)} />
      <div className="sm:col-span-2">{field("accessibility", "Accessibility keywords")}</div>
      <div className="flex flex-wrap gap-2 sm:col-span-2"><Button type="submit" disabled={loading}><Search /> {loading ? "Searching…" : "Search venues"}</Button><Button type="button" variant="outline" onClick={reset}>{additional ? "Reset" : "Reset to event requirements"}</Button></div>
    </form>
    {!additional && !eventDatesMatch && <p role="status" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">These dates differ from the event schedule. Results are for exploration only. Discuss a schedule change with the organiser before requesting a venue for another time.</p>}
    {!additional && hasActiveBooking && <p className="mt-4 text-sm text-slate-600">This event already has an active venue request. You can browse results but cannot submit another request.</p>}
    {message && <p role="alert" className="mt-5 text-sm text-red-700">{message}</p>}
    {loading && <p role="status" className="mt-6 text-sm text-slate-500">Checking venue availability…</p>}
    {visibleResults && <section aria-live="polite" className="mt-7"><h3 className="text-base font-semibold text-slate-950">{visibleResults.length} available {visibleResults.length === 1 ? "venue" : "venues"}</h3>{visibleResults.length === 0 ? <div className="mt-4 rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center"><Building2 className="mx-auto text-primary" aria-hidden="true" /><p className="mt-3 font-medium">No matching venue was found.</p><p className="mt-1 text-sm text-slate-500">Adjust the filters or try another time.</p></div> : <div className="mt-4 grid gap-4 sm:grid-cols-2">{visibleResults.map((venue) => <article key={venue.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-start justify-between gap-2"><h4 className="text-lg font-semibold">{venue.name}</h4><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Available</span></div><p className="mt-2 flex items-center gap-2 text-sm text-slate-600"><MapPin className="size-4" aria-hidden="true" />{venue.location}</p><p className="mt-1 flex items-center gap-2 text-sm text-slate-600"><Users className="size-4" aria-hidden="true" />Capacity {venue.capacity}</p><p className="mt-3 text-sm text-slate-600">Hours: {formatOperatingHours(venue.operatingHours)}</p><p className="mt-1 text-sm text-slate-600">Layouts: {venue.layouts.join(", ") || "None listed"}</p><p className="mt-1 text-sm text-slate-600">Facilities: {venue.facilities.join(", ") || "None listed"}</p><p className="mt-1 text-sm text-slate-600">Accessibility: {venue.accessibilityNotes || "None listed"}</p><p className="mt-1 text-sm text-slate-600">Setup {venue.setupTimeMinutes ?? 0} min &middot; Turnaround {venue.turnaroundTimeMinutes ?? 0} min</p><Link to={`/venues/${venue.id}?forEvent=${event.id}&fromSearch=1${additional ? "&additional=1" : !eventDatesMatch || hasActiveBooking ? "&explore=1" : ""}${replacing ? `&replaces=${replacing.bookingId}` : ""}`} state={{ venueSearch: values, ...(additional ? { additional: true, bookingLabel: label.trim() } : {}) }} className="mt-5 self-start text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary">View details</Link></article>)}</div>}</section>}
  </div>;
}
