import { CalendarDays, Check, Compass, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { ActiveFilterChips } from "@/components/ui/active-filter-chips";
import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { EventBannerImage } from "@/features/event-banners/components/event-banner-image";
import {
  emptyRegistrationFilters,
  registrationFilterChips,
  RegistrationFiltersPanel,
  type RegistrationFilterValues,
} from "@/features/registrations/components/registration-filters";
import { registrationStateLabels } from "@/features/registrations/components/registration-status-badge";
import { RegistrationStatusBadge } from "@/features/registrations/components/registration-status-badge";
import {
  listBrowseEvents,
  type BrowseEventSummary,
} from "@/features/registrations/services/browse-events";
import { ListToolbar } from "@/features/workspace/components/list-toolbar";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

const STATUS_FILTER_OPTIONS = [
  ...(["open", "full", "waitlisted", "not_open", "closed", "registered"] as const).map((value) => ({
    value,
    label: registrationStateLabels[value],
  })),
  { value: "not_required" as const, label: "No registration needed" },
];

const dateFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

export function BrowseEventsPage() {
  usePageTitle("Browse Event");
  const { user } = useAuth();
  const [events, setEvents] = useState<BrowseEventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<RegistrationFilterValues>(emptyRegistrationFilters);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let active = true;
    listBrowseEvents(user.id)
      .then((items) => {
        if (active) setEvents(items);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "We couldn't load events.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user]);

  const filteredEvents = filterEvents(events, searchQuery, filters);

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <header className="border-b border-slate-200 pb-7">
            <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
              Attendee workspace
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-950">
              Browse events
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Confirmed events open for registration.
            </p>
          </header>

          <ListToolbar
            searchPlaceholder="Search events"
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            filters={null}
          />
          <RegistrationFiltersPanel
            value={filters}
            onChange={setFilters}
            statusOptions={STATUS_FILTER_OPTIONS}
          />
          <ActiveFilterChips
            chips={registrationFilterChips(
              filters,
              (value) => registrationStateLabels[value as keyof typeof registrationStateLabels],
              setFilters,
            )}
          />

          {error && (
            <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </p>
          )}

          {loading ? (
            <LoadingGrid />
          ) : events.length === 0 ? (
            <EmptyState />
          ) : filteredEvents.length === 0 ? (
            <NoMatchingEvents
              onClearFilters={() => {
                setSearchQuery("");
                setFilters(emptyRegistrationFilters);
              }}
            />
          ) : (
            <div className="mt-7 grid gap-4 md:grid-cols-2">
              {filteredEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          )}
        </div>
      </div>
    </RoleGate>
  );
}

function EventCard({ event }: { event: BrowseEventSummary }) {
  return (
    <Link
      to={`/browse-events/${event.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_45px_-38px_rgba(15,23,42,0.55)] transition hover:-translate-y-0.5 hover:border-primary/40"
    >
      <EventBannerImage bannerPath={event.bannerPath} />
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            Confirmed
          </span>
          {event.state === "full" && <RegistrationStatusBadge state={event.state} />}
        </div>
        <h2 className="mt-4 text-lg font-semibold tracking-tight text-slate-950 group-hover:text-primary">
          {event.title}
        </h2>
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
          <CalendarDays className="size-4" aria-hidden="true" />
          {event.startsAt ? dateFormatter.format(new Date(event.startsAt)) : "Schedule not set"}
        </div>
        {event.location && (
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            <MapPin className="size-4" aria-hidden="true" />
            {event.location}
          </div>
        )}

        {event.capacity !== null && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-slate-500">
              <span>
                {Math.max(event.capacity - event.registeredCount, 0)} of {event.capacity} spots left
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full rounded-full ${event.state === "full" ? "bg-red-600" : "bg-primary"}`}
                style={{
                  width: `${Math.min((event.registeredCount / event.capacity) * 100, 100)}%`,
                }}
              />
            </div>
          </div>
        )}

        {event.state === "not_open" && event.opensAt && (
          <p className="mt-4 text-xs text-slate-400">
            Registration opens {dateFormatter.format(new Date(event.opensAt))}
          </p>
        )}

        <EventCardCta state={event.state} waitlistEnabled={event.waitlistEnabled} />
      </div>
    </Link>
  );
}

function EventCardCta({
  state,
  waitlistEnabled,
}: {
  state: BrowseEventSummary["state"];
  waitlistEnabled: boolean;
}) {
  if (state === "registered") {
    return (
      <span className="mt-4 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-50 py-2 text-sm font-semibold text-emerald-700">
        <Check className="size-3.5" aria-hidden="true" />
        You&apos;re registered
      </span>
    );
  }
  if (state === "waitlisted") {
    return (
      <span className="mt-4 block rounded-lg bg-amber-100 py-2 text-center text-sm font-semibold text-amber-900">
        On waiting list
      </span>
    );
  }
  if (state === "open") {
    return (
      <span className="mt-4 block rounded-lg bg-primary py-2 text-center text-sm font-semibold text-white">
        Register
      </span>
    );
  }
  if (state === "full" && waitlistEnabled) {
    return (
      <span className="mt-4 block rounded-lg border border-primary py-2 text-center text-sm font-semibold text-primary">
        Join waiting list
      </span>
    );
  }
  if (state === "not_required") {
    return (
      <span className="mt-4 block rounded-lg bg-violet-50 py-2 text-center text-sm font-semibold text-violet-700">
        No registration needed
      </span>
    );
  }
  const label = state === "full" ? "Full" : state === "not_open" ? "Opens soon" : "Closed";
  return (
    <span className="mt-4 block rounded-lg bg-slate-100 py-2 text-center text-sm font-semibold text-slate-600">
      {label}
    </span>
  );
}

function filterEvents(
  events: BrowseEventSummary[],
  query: string,
  filters: RegistrationFilterValues,
): BrowseEventSummary[] {
  const trimmed = query.trim().toLowerCase();
  return events.filter((event) => {
    const matchesSearch = !trimmed || event.title.toLowerCase().includes(trimmed);
    const matchesStatus = !filters.status || event.state === filters.status;
    const eventDate = event.startsAt?.slice(0, 10) ?? null;
    const matchesFrom = !filters.dateFrom || (eventDate !== null && eventDate >= filters.dateFrom);
    return matchesSearch && matchesStatus && matchesFrom;
  });
}

function EmptyState() {
  return (
    <section className="mt-7 grid min-h-80 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
      <div className="max-w-sm py-12">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent text-primary">
          <Compass aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-lg font-semibold text-slate-950">No events yet</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Check back soon — events will show up here once they&apos;re open for registration.
        </p>
      </div>
    </section>
  );
}

function NoMatchingEvents({ onClearFilters }: { onClearFilters: () => void }) {
  return (
    <section className="mt-7 grid min-h-80 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
      <div className="max-w-sm py-12">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent text-primary">
          <Compass aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-lg font-semibold text-slate-950">No matching events</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Try a different search term or adjust your filters.
        </p>
        <button
          type="button"
          onClick={onClearFilters}
          className={buttonVariants({ variant: "outline", className: "mt-5" })}
        >
          Clear filters
        </button>
      </div>
    </section>
  );
}

function LoadingGrid() {
  return (
    <div aria-label="Loading events" className="mt-7 grid gap-4 md:grid-cols-2">
      {[0, 1].map((item) => (
        <div key={item} className="h-56 animate-pulse rounded-2xl bg-slate-200/70 motion-reduce:animate-none" />
      ))}
    </div>
  );
}
