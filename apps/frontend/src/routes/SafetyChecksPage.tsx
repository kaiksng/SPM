import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";

import { PagePlaceholder } from "@/features/workspace/components/page-placeholder";
import {
  listPendingSafetyCheckEvents,
  type PendingSafetyCheckEvent,
} from "@/features/safety-check/services/safety-check-decisions";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

const dateTimeFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

type LocationState = { notice?: string } | null;

/** The Safety Officer's queue: every event currently Pending Safety Check. */
export function SafetyChecksPage() {
  usePageTitle("Safety Checks");
  const { state } = useLocation();
  const [events, setEvents] = useState<PendingSafetyCheckEvent[]>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    setLoading(true);
    listPendingSafetyCheckEvents()
      .then((result) => {
        if (active) setEvents(result);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "The safety check queue is unavailable.",
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

  const notice = (state as LocationState)?.notice;

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-5xl">
          <header className="border-b border-slate-200 pb-7">
            <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
              Safety Officer workspace
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-950">
              Pending safety checks
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Every event currently awaiting an Operational Safety Check review.
            </p>
          </header>

          {notice && (
            <p
              role="status"
              className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
            >
              {notice}
            </p>
          )}

          {error && (
            <p role="alert" className="mt-6 text-sm text-red-700">
              {error}
            </p>
          )}

          {loading ? (
            <div className="mt-6 h-40 animate-pulse rounded-2xl bg-slate-200/70 motion-reduce:animate-none" />
          ) : !events || events.length === 0 ? (
            <div className="mt-6">
              <PagePlaceholder
                title="Nothing to review"
                description="No events are currently awaiting a safety check."
              />
            </div>
          ) : (
            <ul className="mt-6 space-y-3">
              {events.map((event) => (
                <li key={event.eventId}>
                  <Link
                    to={`/safety-checks/${event.eventId}`}
                    className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.55)] transition hover:-translate-y-0.5 hover:border-primary/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-lg font-semibold tracking-tight text-slate-950">
                          {event.title}
                        </h2>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                          <span>Organiser: {event.organiserName ?? "Unknown"}</span>
                          <span>Coordinator: {event.coordinatorName ?? "Unknown"}</span>
                        </div>
                        <p className="mt-2 text-xs text-slate-400">
                          {event.startsAt
                            ? dateTimeFormatter.format(new Date(event.startsAt))
                            : "Schedule not set"}
                          {event.expectedAttendance !== null && ` · ~${event.expectedAttendance} attendees`}
                        </p>
                      </div>
                      {event.round !== null && (
                        <span className="shrink-0 rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-700">
                          Round {event.round}
                        </span>
                      )}
                    </div>
                    <span className="mt-3 inline-flex text-sm font-medium text-primary">
                      Review &rarr;
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </RoleGate>
  );
}
