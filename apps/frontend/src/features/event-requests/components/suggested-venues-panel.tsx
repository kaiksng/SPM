import { formatOperatingHours } from "@spm/shared";
import { Building2, LoaderCircle, MapPin, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { submitVenueBookingRequest } from "@/features/venues/services/venue-bookings";
import { listSuggestedVenues, type VenueSummary } from "@/features/venues/services/venues";

/**
 * "Automatically Suggest Matching Venues": as soon as a Planning-stage event
 * has its own copy of the venue requirements, this panel shows venues that
 * satisfy every mandatory requirement (find_matching_venues) — no filters
 * for the coordinator to enter. Mounted fresh whenever EventDetailPage is
 * (including on return from CoordinatorEventEditPage's save, which navigates
 * to a different route and back), so a requirements change while still in
 * Planning regenerates the list for free.
 *
 * "Manual search" is a visible entry point with no functionality yet — AC7
 * for this iteration is explicit that it does nothing when clicked.
 * "Select venue" (SPM-24) does submit a real venue booking request now.
 */
export function SuggestedVenuesPanel({
  eventId,
  onBooked,
}: {
  eventId: string;
  /** Called once a request is successfully submitted, so the parent page can stop showing suggestions (AC04: at most one active request per event). */
  onBooked: () => void;
}) {
  const [venues, setVenues] = useState<VenueSummary[]>();
  const [error, setError] = useState<string>();

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

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">
          Suggested venues
        </h2>
        <button
          type="button"
          className="cursor-not-allowed text-sm font-medium text-slate-400"
          aria-disabled="true"
          title="Manual search is not available yet"
        >
          Manual search
        </button>
      </div>

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
            <SuggestedVenueCard key={venue.id} eventId={eventId} venue={venue} onBooked={onBooked} />
          ))}
        </div>
      )}
    </section>
  );
}

function SuggestedVenueCard({
  eventId,
  venue,
  onBooked,
}: {
  eventId: string;
  venue: VenueSummary;
  onBooked: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function handleSelect() {
    setSubmitting(true);
    setError(undefined);
    try {
      await submitVenueBookingRequest(eventId, venue.id);
      onBooked();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "This venue booking request could not be submitted.",
      );
      setSubmitting(false);
    }
  }

  return (
    <article className="flex min-h-56 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.55)]">
      <h3 className="text-lg font-semibold tracking-tight text-slate-950">{venue.name}</h3>
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
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={submitting}
        onClick={handleSelect}
        className="mt-auto self-start rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Requesting…" : "Select venue"}
      </button>
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
