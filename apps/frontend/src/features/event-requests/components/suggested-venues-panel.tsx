import { formatOperatingHours } from "@spm/shared";
import { Building2, LoaderCircle, MapPin, Search, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { Input } from "@/components/ui/input";
import {
  listSuggestedVenues,
  listVenues,
  VENUE_AVAILABILITY_LABELS,
  type VenueAvailabilityStatus,
  type VenueSummary,
} from "@/features/venues/services/venues";

/**
 * "Automatically Suggest Matching Venues": as soon as a Planning-stage event
 * has its own copy of the venue requirements, this panel shows venues that
 * satisfy every mandatory requirement (find_matching_venues) — no filters
 * for the coordinator to enter. Mounted fresh whenever EventDetailPage is
 * (including on return from CoordinatorEventEditPage's save, which navigates
 * to a different route and back), so a requirements change while still in
 * Planning regenerates the list for free.
 *
 * "Manual search" switches this panel to the full venue catalogue (not just
 * requirement-matching ones), filtered by name/location — for when the
 * coordinator wants to override the automatic suggestions and pick a venue
 * that doesn't strictly satisfy every requirement.
 * "View details" (SPM-24) sends the coordinator to VenueDetailPage (with a
 * ?forEvent= param) to review the full venue entry before confirming the
 * actual booking request there — this panel itself never submits one.
 */
export function SuggestedVenuesPanel({ eventId }: { eventId: string }) {
  const [venues, setVenues] = useState<VenueSummary[]>();
  const [error, setError] = useState<string>();
  const [manualSearch, setManualSearch] = useState(false);
  const [allVenues, setAllVenues] = useState<VenueSummary[]>();
  const [allVenuesError, setAllVenuesError] = useState<string>();
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let active = true;
    setVenues(undefined);
    setError(undefined);
    listSuggestedVenues(eventId)
      .then((items) => {
        if (active) setVenues(items);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "We couldn't load suggested venues for this event.",
          );
        }
      });

    return () => {
      active = false;
    };
  }, [eventId]);

  useEffect(() => {
    if (!manualSearch || allVenues !== undefined) return;
    let active = true;
    listVenues()
      .then((items) => {
        if (active) setAllVenues(items);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setAllVenuesError(
            loadError instanceof Error ? loadError.message : "We couldn't load the venue catalogue.",
          );
        }
      });

    return () => {
      active = false;
    };
  }, [manualSearch, allVenues]);

  const filteredVenues = filterVenues(allVenues ?? [], searchQuery);

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">
          {manualSearch ? "Search venues" : "Suggested venues"}
        </h2>
        <button
          type="button"
          className="text-sm font-medium text-blue-600 hover:underline"
          onClick={() => setManualSearch((open) => !open)}
        >
          {manualSearch ? "Back to suggested venues" : "Manual search"}
        </button>
      </div>

      {manualSearch ? (
        <>
          <div className="relative mt-4 max-w-xs">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400"
            />
            <Input
              type="search"
              placeholder="Search by venue name or location"
              aria-label="Search by venue name or location"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-9 pl-8"
            />
          </div>

          {allVenuesError && (
            <p role="alert" className="mt-4 text-sm text-red-700">
              {allVenuesError}
            </p>
          )}

          {!allVenuesError && allVenues === undefined && <LoadingGrid />}

          {!allVenuesError && allVenues && filteredVenues.length === 0 && <NoMatchingVenues />}

          {!allVenuesError && allVenues && filteredVenues.length > 0 && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {filteredVenues.map((venue) => (
                <SuggestedVenueCard key={venue.id} eventId={eventId} venue={venue} />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {error && (
            <p role="alert" className="mt-4 text-sm text-red-700">
              {error}
            </p>
          )}

          {!error && venues === undefined && <LoadingGrid />}

          {!error && venues && venues.length === 0 && <NoMatchingVenues />}

          {!error && venues && venues.length > 0 && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {venues.map((venue) => (
                <SuggestedVenueCard key={venue.id} eventId={eventId} venue={venue} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** Case-insensitive substring match on name/location, same as VenuesPage's own search. */
function filterVenues(venues: VenueSummary[], query: string) {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return venues;
  return venues.filter(
    (venue) =>
      venue.name.toLowerCase().includes(trimmed) || venue.location.toLowerCase().includes(trimmed),
  );
}

const AVAILABILITY_CLASSES: Record<VenueAvailabilityStatus, string> = {
  available: "border-emerald-200 bg-emerald-50 text-emerald-700",
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  confirmed: "border-blue-200 bg-blue-50 text-blue-700",
  blocked: "border-red-200 bg-red-50 text-red-700",
};

function SuggestedVenueCard({ eventId, venue }: { eventId: string; venue: VenueSummary }) {
  return (
    <article className="flex min-h-56 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.55)]">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-lg font-semibold tracking-tight text-slate-950">{venue.name}</h3>
        {venue.availabilityStatus && (
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${AVAILABILITY_CLASSES[venue.availabilityStatus]}`}
          >
            {VENUE_AVAILABILITY_LABELS[venue.availabilityStatus]}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
        <MapPin className="size-4 shrink-0" aria-hidden="true" />
        {venue.location}
      </div>
      <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
        <Users className="size-4 shrink-0" aria-hidden="true" />
        Capacity: {venue.capacity}
      </div>
      {venue.facilities.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {venue.facilities.map((facility) => (
            <span
              key={facility}
              className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
            >
              {facility}
            </span>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">{formatOperatingHours(venue.operatingHours)}</p>
      <Link
        to={`/venues/${venue.id}?forEvent=${eventId}${venue.availabilityStatus ? `&status=${venue.availabilityStatus}` : ""}`}
        className="mt-auto self-start rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
      >
        View details
      </Link>
    </article>
  );
}

function NoMatchingVenues() {
  return (
    <div className="mt-4 grid place-items-center rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-blue-50 text-blue-600">
        <Building2 aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-slate-950">No matching venues</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
        No venue in the catalogue currently meets every requirement for this event.
      </p>
    </div>
  );
}

function LoadingGrid() {
  return (
    <div
      aria-label="Loading suggested venues"
      className="mt-4 grid min-h-56 place-items-center rounded-2xl border border-dashed border-slate-200"
    >
      <LoaderCircle
        aria-hidden="true"
        className="size-6 animate-spin text-blue-600 motion-reduce:animate-none"
      />
    </div>
  );
}
