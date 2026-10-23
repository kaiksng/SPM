import { CalendarDays, ClipboardList, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { ActiveFilterChips } from "@/components/ui/active-filter-chips";
import { Button, buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import {
  emptyRegistrationFilters,
  registrationFilterChips,
  RegistrationFiltersPanel,
  type RegistrationFilterValues,
} from "@/features/registrations/components/registration-filters";
import {
  leaveWaitlist,
  listMyRegistrations,
  type MyRegistration,
} from "@/features/registrations/services/registrations";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

const STATUS_FILTER_OPTIONS = [
  { value: "registered", label: "Registered" },
  { value: "waitlisted", label: "Waiting list" },
  { value: "withdrawn", label: "Withdrawn" },
];

const STATUS_LABELS: Record<string, string> = {
  registered: "Registered",
  waitlisted: "Waiting list",
  withdrawn: "Withdrawn",
};

const STATUS_BADGE_STYLES: Record<string, string> = {
  registered: "border-emerald-200 bg-emerald-50 text-emerald-700",
  waitlisted: "border-amber-200 bg-amber-50 text-amber-800",
  withdrawn: "border-slate-200 bg-slate-50 text-slate-500",
};

const dateFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

export function MyRegistrationsPage() {
  usePageTitle("My registrations");
  const { user } = useAuth();
  const [registrations, setRegistrations] = useState<MyRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [filters, setFilters] = useState<RegistrationFilterValues>(emptyRegistrationFilters);
  const [leavingEventId, setLeavingEventId] = useState<string>();
  const [actionError, setActionError] = useState<string>();

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let active = true;
    listMyRegistrations(user.id)
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
  }, [user]);

  async function handleLeaveWaitlist(eventId: string) {
    setLeavingEventId(eventId);
    setActionError(undefined);
    try {
      await leaveWaitlist(eventId);
      setRegistrations((current) => current.filter((item) => item.eventId !== eventId));
    } catch (leaveError) {
      setActionError(
        leaveError instanceof Error ? leaveError.message : "Could not leave the waiting list.",
      );
    } finally {
      setLeavingEventId(undefined);
    }
  }

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
          {actionError && (
            <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {actionError}
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
                  <RegistrationRow
                    registration={registration}
                    leaving={leavingEventId === registration.eventId}
                    onLeaveWaitlist={() => handleLeaveWaitlist(registration.eventId)}
                  />
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </RoleGate>
  );
}

function RegistrationRow({
  registration,
  leaving,
  onLeaveWaitlist,
}: {
  registration: MyRegistration;
  leaving: boolean;
  onLeaveWaitlist: () => void;
}) {
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
        {registration.status === "waitlisted" && registration.waitlistPosition !== null && (
          <p className="mt-1 text-xs text-amber-700">Position {registration.waitlistPosition}</p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <span
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${STATUS_BADGE_STYLES[registration.status] ?? "border-slate-200 bg-slate-50 text-slate-500"}`}
        >
          {STATUS_LABELS[registration.status] ?? registration.status}
        </span>
        {registration.status === "waitlisted" && (
          <Button type="button" variant="outline" size="sm" disabled={leaving} onClick={onLeaveWaitlist}>
            {leaving ? "Leaving…" : "Leave waiting list"}
          </Button>
        )}
      </div>
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
