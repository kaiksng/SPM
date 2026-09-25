import { hasPermission } from "@spm/shared";
import { Building2, FilePlus2, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { VenueCard } from "@/features/venues/components/venue-card";
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
