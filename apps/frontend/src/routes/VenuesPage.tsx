import { hasPermission } from "@spm/shared";
import { Building2, FilePlus2, MapPin, Search, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { StatusBadge } from "@/features/event-requests/components/status-badges";
import { listVenues, type VenueSummary } from "@/features/venues/services/venues";
import { ListToolbar } from "@/features/workspace/components/list-toolbar";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

export function VenuesPage() {
  usePageTitle("Venues");
  const { profile } = useAuth();
  const [venues, setVenues] = useState<VenueSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [searchQuery, setSearchQuery] = useState("");
  const canManageVenues = hasPermission(profile?.role ?? "attendee", "manageVenue");

  useEffect(() => {
    let active = true;
    listVenues()
      .then((items) => {
        if (active) setVenues(items);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "We couldn't load the venue catalogue.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const filteredVenues = filterVenues(venues, searchQuery);

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <header className="border-b border-slate-200 pb-7">
            <p className="text-xs font-semibold tracking-[0.16em] text-blue-600 uppercase">
              Venue workspace
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-950">
              Venues
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Browse the venue catalogue: location, capacity, facilities and operating hours.
            </p>
          </header>

          <ListToolbar
            searchPlaceholder="Search venues"
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            action={
              canManageVenues ? (
                <Link to="/venues/new" className={buttonVariants({ size: "sm" })}>
                  <FilePlus2 /> New venue
                </Link>
              ) : undefined
            }
          />

          {error && (
            <p
              role="alert"
              className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {error}
            </p>
          )}

          {loading ? (
            <LoadingList />
          ) : venues.length === 0 ? (
            <EmptyState canManageVenues={canManageVenues} />
          ) : filteredVenues.length === 0 ? (
            <NoSearchResults />
          ) : (
            <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredVenues.map((venue) => (
                <VenueCard key={venue.id} venue={venue} canManageVenues={canManageVenues} />
              ))}
            </div>
          )}
        </div>
      </div>
    </RoleGate>
  );
}

/** Case-insensitive substring match on name/location — the search box filters by. */
function filterVenues(venues: VenueSummary[], query: string) {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return venues;
  return venues.filter(
    (venue) =>
      venue.name.toLowerCase().includes(trimmed) ||
      venue.location.toLowerCase().includes(trimmed),
  );
}

function VenueCard({
  venue,
  canManageVenues,
}: {
  venue: VenueSummary;
  canManageVenues: boolean;
}) {
  const cardClassName =
    "group flex min-h-56 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.55)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_22px_50px_-34px_rgba(37,99,235,0.35)] motion-reduce:transform-none";

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* AC06: only venue staff/administrator act on Needs Review, so
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
      <h2 className="mt-5 text-lg font-semibold tracking-tight text-slate-950 group-hover:text-blue-700">
        {venue.name}
      </h2>
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
      <p className="mt-3 text-xs text-slate-500">{venue.operatingHours}</p>
      <span className="mt-auto pt-4 text-sm font-medium text-blue-600 group-hover:underline">
        View details
      </span>
    </>
  );

  // The whole card is a click target to the read-only detail view — editing
  // is a separate, explicit action from there, not the click's default.
  return (
    <Link to={`/venues/${venue.id}`} className={cardClassName}>
      {content}
    </Link>
  );
}

function NoSearchResults() {
  return (
    <section className="mt-7 grid min-h-80 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
      <div className="max-w-sm py-12">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-blue-50 text-blue-600">
          <Search aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-lg font-semibold text-slate-950">No matching venues</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">Try a different search term.</p>
      </div>
    </section>
  );
}

function EmptyState({ canManageVenues }: { canManageVenues: boolean }) {
  return (
    <section className="mt-7 grid min-h-80 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
      <div className="max-w-sm py-12">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-blue-50 text-blue-600">
          <Building2 aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-lg font-semibold text-slate-950">No venues yet</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {canManageVenues
            ? "Add a venue to the catalogue so coordinators can find it when booking."
            : "Venues will show up here once they're added to the system."}
        </p>
        {canManageVenues && (
          <Link to="/venues/new" className={buttonVariants({ className: "mt-5" })}>
            Add the first venue
          </Link>
        )}
      </div>
    </section>
  );
}

function LoadingList() {
  return (
    <div aria-label="Loading venues" className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="h-56 animate-pulse rounded-2xl bg-slate-200/70 motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}
