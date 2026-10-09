import { formatOperatingHours } from "@spm/shared";
import { Building2, MapPin, Users } from "lucide-react";
import { Link } from "react-router";

import { StatusBadge } from "@/features/event-requests/components/status-badges";
import { getVenueLayoutImage } from "@/features/venues/utils/venue-layout-image";
import type { VenueSummary } from "@/features/venues/services/venues";

/**
 * The venue catalogue's card, shared by VenuesPage and the Planning-stage
 * "Suggested venues" panel (EventDetailPage) so both render venues with the
 * exact same visual language. The whole card is a click target to the
 * read-only detail view — editing is a separate, explicit action from there,
 * not the click's default.
 */
export function VenueCard({
  venue,
  canManageVenues,
}: {
  venue: VenueSummary;
  canManageVenues: boolean;
}) {
  const cardClassName =
    "group flex min-h-56 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_45px_-38px_rgba(15,23,42,0.55)] transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_22px_50px_-34px_rgba(37,99,235,0.35)] motion-reduce:transform-none";

  const layoutImage = getVenueLayoutImage(venue.layouts);

  const content = (
    <>
      {layoutImage ? (
        <img
          src={layoutImage}
          alt=""
          aria-hidden="true"
          className="h-36 w-full object-cover"
        />
      ) : (
        <div className="grid h-36 w-full place-items-center bg-accent">
          <Building2 className="size-8 text-primary" aria-hidden="true" />
        </div>
      )}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* AC06: only venue staff act on Needs Review, so
                only they see the badge here. */}
            {canManageVenues && venue.needsReviewCount > 0 && (
              <StatusBadge status="needs_review" />
            )}
          </div>
          <span className="shrink-0 text-xs text-slate-400">
            Updated{" "}
            {new Intl.DateTimeFormat("en-SG", {
              dateStyle: "medium",
              timeZone: "Asia/Singapore",
            }).format(new Date(venue.updatedAt))}
            {venue.updatedByName && ` by ${venue.updatedByName}`}
          </span>
        </div>
        <h2 className="mt-5 text-lg font-semibold tracking-tight text-slate-950 group-hover:text-primary">
          {venue.name}
        </h2>
        <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
          <MapPin className="size-4 shrink-0" aria-hidden="true" />
          {venue.areaTags?.[0] ?? venue.location}
        </div>
        {venue.areaTags?.[0] && venue.location !== venue.areaTags[0] && (
          <p className="mt-1 text-xs text-slate-500">
            Address: {venue.location}
          </p>
        )}
        {canManageVenues && !venue.areaTags?.length && <p className="mt-1 text-xs text-amber-700">Location not selected yet</p>}
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
        <p className="mt-1 text-xs text-slate-500">
          Setup {venue.setupTimeMinutes ?? 0} min · Turnaround {venue.turnaroundTimeMinutes ?? 0} min
        </p>
        <span className="mt-auto pt-4 text-sm font-medium text-primary group-hover:underline">
          View details
        </span>
      </div>
    </>
  );

  return (
    <Link to={`/venues/${venue.id}`} className={cardClassName}>
      {content}
    </Link>
  );
}
