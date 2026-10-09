import { Building2, CalendarClock, Flag } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import {
  listFlaggedBookingConflicts,
  recheckAllVenueConflicts,
  type FlaggedBookingConflict,
} from "@/features/venues/services/venues";
import { getVenueLayoutImage } from "@/features/venues/utils/venue-layout-image";
import { ListToolbar } from "@/features/workspace/components/list-toolbar";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

const dateTimeFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

/**
 * Venue Staff's working queue of bookings whose effective window (period +
 * the venue's setup/turnaround time) now overlaps another booking or block.
 * A separate page from Requests (not a filtered view of it) — resolving a
 * conflict is a different task from deciding a pending request, and most
 * flagged bookings here are already Approved, not Pending.
 */
export function FlaggedBookingsPage() {
  usePageTitle("Flagged bookings");
  const [conflicts, setConflicts] = useState<FlaggedBookingConflict[]>();
  const [error, setError] = useState<string>();
  const [searchQuery, setSearchQuery] = useState("");
  const [rechecking, setRechecking] = useState(false);
  const [recheckMessage, setRecheckMessage] = useState<string>();

  function load() {
    listFlaggedBookingConflicts()
      .then(setConflicts)
      .catch((loadError: unknown) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "We couldn't load flagged bookings.",
        );
      });
  }

  useEffect(load, []);

  async function handleRecheckAll() {
    setRechecking(true);
    setRecheckMessage(undefined);
    try {
      const result = await recheckAllVenueConflicts();
      setRecheckMessage(
        `Re-checked every venue — ${result.flaggedCount} newly flagged, ${result.clearedCount} cleared since the last re-check. Already-flagged bookings below are unaffected.`,
      );
      load();
    } catch (recheckError) {
      setError(
        recheckError instanceof Error
          ? recheckError.message
          : "Venues could not be re-checked.",
      );
    } finally {
      setRechecking(false);
    }
  }

  const filtered = filterConflicts(conflicts ?? [], searchQuery);

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-5xl">
          <header className="border-b border-slate-200 pb-7">
            <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
              Venue workspace
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-950">
              Flagged bookings
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Bookings whose effective window — the booked period plus setup and turnaround
              time — now overlaps another booking or block. Nothing here is cancelled
              automatically; each one needs a coordinator's action.
            </p>
          </header>

          <ListToolbar
            searchPlaceholder="Search by event or venue"
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={rechecking}
                onClick={handleRecheckAll}
              >
                <CalendarClock /> {rechecking ? "Re-checking…" : "Re-check all venues"}
              </Button>
            }
          />

          {recheckMessage && (
            <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {recheckMessage}
            </p>
          )}

          {error && (
            <p
              role="alert"
              className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {error}
            </p>
          )}

          {conflicts === undefined ? (
            <LoadingList />
          ) : conflicts.length === 0 ? (
            <EmptyState />
          ) : filtered.length === 0 ? (
            <NoSearchResults />
          ) : (
            <ul className="mt-7 space-y-4">
              {filtered.map((conflict) => (
                <li key={conflict.id}>
                  <ConflictCard conflict={conflict} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </RoleGate>
  );
}

function ConflictCard({ conflict }: { conflict: FlaggedBookingConflict }) {
  const layoutImage = getVenueLayoutImage(conflict.venueLayouts);

  return (
    <article className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-6">
      {layoutImage ? (
        <img
          src={layoutImage}
          alt=""
          aria-hidden="true"
          className="hidden size-24 shrink-0 rounded-xl object-cover sm:block"
        />
      ) : (
        <div className="hidden size-24 shrink-0 place-items-center rounded-xl bg-accent sm:grid">
          <Building2 className="size-6 text-primary" aria-hidden="true" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link
              to={`/events/${conflict.eventId}`}
              className="text-base font-semibold text-slate-950 hover:text-primary"
            >
              {conflict.eventTitle}
            </Link>
            <p className="mt-1 text-sm text-slate-600">{conflict.venueName}</p>
          </div>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
            Conflict – Needs Review
          </span>
        </div>

        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-slate-400">Requested period</dt>
            <dd className="mt-1 text-sm text-slate-800">
              {dateTimeFormatter.format(new Date(conflict.startsAt))}
              {" – "}
              {dateTimeFormatter.format(new Date(conflict.endsAt))}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-400">Assigned coordinator</dt>
            <dd className="mt-1 text-sm text-slate-800">
              {conflict.coordinatorName ?? "Unassigned"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-400">Conflicts with</dt>
            <dd className="mt-1 text-sm text-slate-800">
              {conflict.conflictingEventTitle
                ? `Booking: "${conflict.conflictingEventTitle}"`
                : `Block: "${conflict.conflictingBlockReason ?? "Reason not recorded"}"`}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-400">Flagged</dt>
            <dd className="mt-1 text-sm text-slate-800">
              {dateTimeFormatter.format(new Date(conflict.flaggedAt))}
            </dd>
          </div>
        </dl>

        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {conflict.conflictingEventTitle
            ? `This booking clashes with another booking ("${conflict.conflictingEventTitle}"). The event coordinator (${conflict.coordinatorName ?? "the assigned coordinator"}) would resolve this conflict soon.`
            : `This booking clashes with a venue block ("${conflict.conflictingBlockReason ?? "Reason not recorded"}"). The event coordinator (${conflict.coordinatorName ?? "the assigned coordinator"}) would resolve this conflict soon.`}
        </p>
      </div>
    </article>
  );
}

/** Case-insensitive substring match on event title/venue name/requester. */
function filterConflicts(conflicts: FlaggedBookingConflict[], query: string) {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return conflicts;
  return conflicts.filter(
    (conflict) =>
      conflict.eventTitle.toLowerCase().includes(trimmed) ||
      conflict.venueName.toLowerCase().includes(trimmed) ||
      (conflict.coordinatorName ?? "").toLowerCase().includes(trimmed),
  );
}

function NoSearchResults() {
  return (
    <section className="mt-7 grid min-h-64 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
      <div className="max-w-sm py-12">
        <h2 className="text-lg font-semibold text-slate-950">No matching flagged bookings</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">Try a different search term.</p>
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <section className="mt-7 grid min-h-64 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
      <div className="max-w-sm py-12">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent text-primary">
          <Flag aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-lg font-semibold text-slate-950">No flagged bookings</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Every Pending and Approved booking currently fits without a scheduling conflict.
        </p>
      </div>
    </section>
  );
}

function LoadingList() {
  return (
    <div className="mt-7 space-y-4">
      {[0, 1, 2].map((key) => (
        <div
          key={key}
          className="h-40 animate-pulse rounded-2xl bg-slate-200/70 motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}
