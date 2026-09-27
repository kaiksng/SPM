import {
  asRoomLayoutType, formatOperatingHours, isoToSingaporeLocal, ROOM_LAYOUT_TYPES,
  venueSearchSchema, type VenueSearchValues,
} from "@spm/shared";
import { Building2, MapPin, Search, Users } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EventDetail } from "@/features/event-requests/services/event-details";
import { searchAvailableVenues } from "@/features/venues/services/venue-search";
import type { VenueSummary } from "@/features/venues/services/venues";

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

export function ManualVenueSearch({ event, hasActiveBooking }: { event: EventDetail; hasActiveBooking: boolean }) {
  const location = useLocation();
  const saved = (location.state as { venueSearch?: VenueSearchValues } | null)?.venueSearch;
  const [values, setValues] = useState<VenueSearchValues>(() => saved ?? eventSearchDefaults(event));
  const [facilitiesText, setFacilitiesText] = useState(() => values.facilities.join(", "));
  const [results, setResults] = useState<VenueSummary[]>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const eventDatesMatch = values.startsAt === (event.startsAt ? isoToSingaporeLocal(event.startsAt) : "")
    && values.endsAt === (event.endsAt ? isoToSingaporeLocal(event.endsAt) : "");

  function update<K extends keyof VenueSearchValues>(key: K, value: VenueSearchValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setResults(undefined);
    setErrors((current) => ({ ...current, [key]: "" }));
  }

  async function search(e: React.FormEvent) {
    e.preventDefault(); setMessage("");
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
    const defaults = eventSearchDefaults(event);
    setValues(defaults); setFacilitiesText(defaults.facilities.join(", "));
    setResults(undefined); setErrors({}); setMessage("");
  }

  const field = (key: "startsAt" | "endsAt" | "minimumCapacity" | "location" | "accessibility", label: string, type = "text") =>
    <div><label htmlFor={`venue-search-${key}`} className="mb-1 block text-sm font-medium text-slate-700">{label}</label><Input id={`venue-search-${key}`} type={type} value={values[key]} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${key}-error` : undefined} onChange={(e) => update(key, e.target.value)} />{errors[key] && <p id={`${key}-error`} className="mt-1 text-sm text-red-700">{errors[key]}</p>}</div>;

  return <div className="mt-5">
    <p className="text-sm text-slate-600">Adjust requirements to find available venues. Search does not change the event.</p>
    <form onSubmit={search} noValidate className="mt-5 grid gap-4 sm:grid-cols-2">
      {field("startsAt", "Start date and time *", "datetime-local")}
      {field("endsAt", "End date and time *", "datetime-local")}
      {field("minimumCapacity", "Minimum capacity *", "number")}
      {field("location", "Location")}
      <div><label htmlFor="venue-search-layout" className="mb-1 block text-sm font-medium text-slate-700">Room layout</label><select id="venue-search-layout" value={values.layout} onChange={(e) => update("layout", e.target.value as VenueSearchValues["layout"])} className="border-input h-8 w-full rounded-lg border bg-white px-2.5 text-sm focus-visible:ring-3 focus-visible:ring-blue-300"><option value="">Any layout</option>{ROOM_LAYOUT_TYPES.map((layout) => <option key={layout} value={layout}>{layout}</option>)}</select></div>
      <div><label htmlFor="venue-search-facilities" className="mb-1 block text-sm font-medium text-slate-700">Required facilities</label><Input id="venue-search-facilities" value={facilitiesText} placeholder="Comma-separated, e.g. Projector, Wi-Fi" onChange={(e) => { setFacilitiesText(e.target.value); update("facilities", e.target.value.split(",").map((part) => part.trim()).filter(Boolean)); }} /></div>
      <div className="sm:col-span-2">{field("accessibility", "Accessibility keywords")}</div>
      <div className="flex flex-wrap gap-2 sm:col-span-2"><Button type="submit" disabled={loading}><Search /> {loading ? "Searching…" : "Search venues"}</Button><Button type="button" variant="outline" onClick={reset}>Reset to event requirements</Button></div>
    </form>
    {!eventDatesMatch && <p role="status" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">These dates differ from the event schedule. Results are for exploration only; update the event before requesting a venue for this slot.</p>}
    {hasActiveBooking && <p className="mt-4 text-sm text-slate-600">This event already has an active venue request. You can browse results but cannot submit another request.</p>}
    {message && <p role="alert" className="mt-5 text-sm text-red-700">{message}</p>}
    {loading && <p role="status" className="mt-6 text-sm text-slate-500">Checking venue availability…</p>}
    {results && <section aria-live="polite" className="mt-7"><h3 className="text-base font-semibold text-slate-950">{results.length} available {results.length === 1 ? "venue" : "venues"}</h3>{results.length === 0 ? <div className="mt-4 rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center"><Building2 className="mx-auto text-blue-600" aria-hidden="true" /><p className="mt-3 font-medium">No matching venue was found.</p><p className="mt-1 text-sm text-slate-500">Adjust the filters or try another time.</p></div> : <div className="mt-4 grid gap-4 sm:grid-cols-2">{results.map((venue) => <article key={venue.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-start justify-between gap-2"><h4 className="text-lg font-semibold">{venue.name}</h4><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Available</span></div><p className="mt-2 flex items-center gap-2 text-sm text-slate-600"><MapPin className="size-4" aria-hidden="true" />{venue.location}</p><p className="mt-1 flex items-center gap-2 text-sm text-slate-600"><Users className="size-4" aria-hidden="true" />Capacity {venue.capacity}</p><p className="mt-3 text-sm text-slate-600">Hours: {formatOperatingHours(venue.operatingHours)}</p><p className="mt-1 text-sm text-slate-600">Layouts: {venue.layouts.join(", ") || "None listed"}</p><p className="mt-1 text-sm text-slate-600">Facilities: {venue.facilities.join(", ") || "None listed"}</p><p className="mt-1 text-sm text-slate-600">Accessibility: {venue.accessibilityNotes || "None listed"}</p><Link to={`/venues/${venue.id}?forEvent=${event.id}&fromSearch=1${!eventDatesMatch || hasActiveBooking ? "&explore=1" : ""}`} state={{ venueSearch: values }} className="mt-5 self-start text-sm font-semibold text-blue-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-blue-600">View details</Link></article>)}</div>}</section>}
  </div>;
}
