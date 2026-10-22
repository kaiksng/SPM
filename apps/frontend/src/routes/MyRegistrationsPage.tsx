import { CalendarDays, ClipboardList, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { ActiveFilterChips } from "@/components/ui/active-filter-chips";
import { buttonVariants } from "@/components/ui/button";
import {
  emptyRegistrationFilters,
  registrationFilterChips,
  RegistrationFiltersPanel,
  type RegistrationFilterValues,
} from "@/features/registrations/components/registration-filters";
import { listMyRegistrations, type MyRegistration } from "@/features/registrations/services/registrations";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

const STATUS_FILTER_OPTIONS = [
  { value: "registered", label: "Registered" },
  { value: "waitlisted", label: "Waitlisted" },
  { value: "withdrawn", label: "Withdrawn" },
];

const STATUS_LABELS: Record<string, string> = {
  registered: "Registered",
  waitlisted: "Waitlisted",
  withdrawn: "Withdrawn",
};

const dateFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

export function MyRegistrationsPage() {
  usePageTitle("My registrations");
  const [registrations, setRegistrations] = useState<MyRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [filters, setFilters] = useState<RegistrationFilterValues>(emptyRegistrationFilters);

  useEffect(() => {
    let active = true;
    listMyRegistrations()
      .then((items) => {
        if (active) setRegistrations(items);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "We couldn't load your registrations.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filtered = registrations.filter((registration) => {
    const matchesStatus = !filters.status || registration.status === filters.status;
    const eventDate = registration.startsAt?.slice(0, 10) ?? null;
    const matchesFrom = !filters.dateFrom || (eventDate !== null && eventDate >= filters.dateFrom);
    return matchesStatus && matchesFrom;
  });

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-5xl">
          <header className="border-b border-slate-200 pb-7">
            <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
              Attendee workspace
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-950">
              My registrations
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Every event you&apos;ve registered for.
            </p>
          </header>

          <RegistrationFiltersPanel
            value={filters}
            onChange={setFilters}
            statusOptions={STATUS_FILTER_OPTIONS}
          />
          <ActiveFilterChips
            chips={registrationFilterChips(filters, (value) => STATUS_LABELS[value] ?? value, setFilters)}
          />

          {error && (
            <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </p>
          )}

          {loading ? (
            <div aria-label="Loading registrations" className="mt-6 flex flex-col gap-3">
              {[0, 1].map((item) => (
                <div key={item} className="h-20 animate-pulse rounded-2xl bg-slate-200/70 motion-reduce:animate-none" />
              ))}
            </div>
          ) : registrations.length === 0 ? (
            <EmptyState />
          ) : filtered.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500">No registrations match these filters.</p>
          ) : (
            <ol className="mt-6 flex flex-col gap-3">
              {filtered.map((registration) => (
                <li key={registration.id}>
                  <RegistrationRow registration={registration} />
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </RoleGate>
  );
}

function RegistrationRow({ registration }: { registration: MyRegistration }) {
  return (
    <article className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="min-w-0 flex-1">
        <Link
          to={`/browse-events/${registration.eventId}`}
          className="text-[15.5px] font-semibold text-slate-950 hover:text-primary"
        >
          {registration.title}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            {registration.startsAt ? dateFormatter.format(new Date(registration.startsAt)) : "Schedule not set"}
          </span>
          {registration.location && (
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden="true" />
              {registration.location}
            </span>
          )}
        </div>
      </div>
      <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
        {STATUS_LABELS[registration.status] ?? registration.status}
      </span>
    </article>
  );
}

function EmptyState() {
  return (
    <section className="mt-7 grid min-h-72 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
      <div className="max-w-sm py-12">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent text-primary">
          <ClipboardList aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-lg font-semibold text-slate-950">No registrations yet</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Register for a confirmed event and it will show up here.
        </p>
        <Link to="/browse-events" className={buttonVariants({ className: "mt-5" })}>
          Browse events
        </Link>
      </div>
    </section>
  );
}
