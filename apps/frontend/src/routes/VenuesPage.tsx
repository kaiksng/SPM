import { hasPermission } from "@spm/shared";
import { Building2, FilePlus2, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { ActiveFilterChips } from "@/components/ui/active-filter-chips";
import { Button, buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { VenueCard } from "@/features/venues/components/venue-card";
import {
  countActiveVenueFilters,
  emptyVenueFilters,
  VenueFiltersPanel,
  venueFilterChips,
  type VenueFilterValues,
} from "@/features/venues/components/venue-filters";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("q") ?? "");
  const [filters, setFilters] = useState<VenueFilterValues>(() => filtersFromParams(searchParams));
  const canManageVenues = hasPermission(profile?.role ?? "attendee", "manageVenue");

  // Kept in the URL (not just component state) so the Venues list a user
  // filtered is still there when they go back from a venue's detail page.
  useEffect(() => {
    setSearchParams(paramsFromFilters(searchQuery, filters), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, filters]);

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

  const filteredVenues = filterVenues(venues, searchQuery, filters);

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <header className="border-b border-slate-200 pb-7">
            <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
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
            filters={null}
            action={
              canManageVenues ? (
                <Link to="/venues/new" className={buttonVariants({ size: "sm" })}>
                  <FilePlus2 /> New venue
                </Link>
              ) : undefined
            }
          />
          <VenueFiltersPanel value={filters} onChange={setFilters} />
          <ActiveFilterChips chips={venueFilterChips(filters, setFilters)} />

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
            <NoMatchingVenues
              filtersActive={countActiveVenueFilters(filters) > 0}
              onClearFilters={() => setFilters(emptyVenueFilters)}
            />
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

function filtersFromParams(params: URLSearchParams): VenueFilterValues {
  return {
    area: params.get("area") ?? "",
    minCapacity: params.get("minCapacity") ?? "",
    facilities: params.getAll("facility"),
    layout: params.get("layout") ?? "",
    accessibility: params.get("accessibility") ?? "",
  };
}

function paramsFromFilters(query: string, filters: VenueFilterValues): URLSearchParams {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (filters.area) params.set("area", filters.area);
  if (filters.minCapacity) params.set("minCapacity", filters.minCapacity);
  if (filters.layout) params.set("layout", filters.layout);
  if (filters.accessibility) params.set("accessibility", filters.accessibility);
  for (const facility of filters.facilities) params.append("facility", facility);
  return params;
}

/** A venue must match the search term and every active filter category. */
function filterVenues(venues: VenueSummary[], query: string, filters: VenueFilterValues) {
  const trimmed = query.trim().toLowerCase();
  return venues.filter((venue) => {
    const matchesSearch =
      !trimmed ||
      venue.name.toLowerCase().includes(trimmed) ||
      venue.location.toLowerCase().includes(trimmed) ||
      venue.areaTags.some((area) => area.toLowerCase().includes(trimmed));

    const matchesArea = !filters.area || venue.areaTags.includes(filters.area);
    const matchesCapacity =
      !filters.minCapacity || venue.capacity >= Number(filters.minCapacity);
    const matchesFacilities = filters.facilities.every((facility) =>
      venue.facilities.includes(facility),
    );
    const matchesLayout = !filters.layout || venue.layouts.includes(filters.layout);
    const matchesAccessibility =
      !filters.accessibility ||
      (venue.accessibilityNotes ?? "")
        .toLowerCase()
        .includes(filters.accessibility.trim().toLowerCase());

    return (
      matchesSearch &&
      matchesArea &&
      matchesCapacity &&
      matchesFacilities &&
      matchesLayout &&
      matchesAccessibility
    );
  });
}

function NoMatchingVenues({
  filtersActive,
  onClearFilters,
}: {
  filtersActive: boolean;
  onClearFilters: () => void;
}) {
  return (
    <section className="mt-7 grid min-h-80 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
      <div className="max-w-sm py-12">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent text-primary">
          <Search aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-lg font-semibold text-slate-950">No matching venues</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Try a different search term or adjust your filters.
        </p>
        {filtersActive && (
          <Button type="button" variant="outline" className="mt-5" onClick={onClearFilters}>
            Clear filters
          </Button>
        )}
      </div>
    </section>
  );
}

function EmptyState({ canManageVenues }: { canManageVenues: boolean }) {
  return (
    <section className="mt-7 grid min-h-80 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
      <div className="max-w-sm py-12">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent text-primary">
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
