import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import { buttonVariants } from "@/components/ui/button";
import { EventPlanningTimeline } from "@/features/event-requests/components/event-planning-timeline";
import { SuggestedVenuesPanel } from "@/features/event-requests/components/suggested-venues-panel";
import {
  loadEventDetail,
  type EventDetail,
} from "@/features/event-requests/services/event-details";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

/**
 * The "Venue" sub-step of an event's Planning stage — its own page rather
 * than inline on EventDetailPage, reached by clicking "Venue" in the
 * sidebar. Keeps the same EventPlanningTimeline sidebar so a coordinator
 * doesn't lose their place in the event's lifecycle while looking at
 * suggested venues.
 */
export function EventVenuePage() {
  const { eventId } = useParams();
  const [event, setEvent] = useState<EventDetail>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  usePageTitle(event?.title ? `Venue — ${event.title}` : "Venue");

  useEffect(() => {
    if (!eventId) return;
    let active = true;
    setLoading(true);
    loadEventDetail(eventId)
      .then((detail) => {
        if (active) setEvent(detail);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "This event is unavailable or you do not have access to it.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [eventId]);

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-5xl">
          <Link
            to={`/events/${eventId}`}
            className={buttonVariants({ variant: "ghost", className: "-ml-2" })}
          >
            <ArrowLeft /> Back to event
          </Link>

          {loading ? (
            <div className="mt-7 h-96 animate-pulse rounded-2xl bg-slate-200/70 motion-reduce:animate-none" />
          ) : error || !event || !eventId ? (
            <section className="mt-7 rounded-2xl border border-red-200 bg-red-50 p-6">
              <h1 className="font-semibold text-red-900">Event unavailable</h1>
              <p role="alert" className="mt-2 text-sm text-red-800">
                {error ?? "This event could not be found."}
              </p>
            </section>
          ) : (
            <div className="mt-6 lg:flex lg:items-start lg:gap-10">
              <div className="mb-6 lg:mb-0 lg:sticky lg:top-24">
                <EventPlanningTimeline status={event.status} eventId={event.id} />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950">
                  Venue
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  Venues that satisfy every requirement for this event.
                </p>

                <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
                  <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">
                    Venue requirements
                  </h2>
                  <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs font-medium text-slate-400">Expected attendance</dt>
                      <dd className="mt-1 text-sm text-slate-800">
                        {event.expectedAttendance != null
                          ? `${event.expectedAttendance} attendees`
                          : "Not provided"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-400">Preferred location</dt>
                      <dd className="mt-1 text-sm text-slate-800">
                        {event.venue.preferredLocation || "Not provided"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-400">Room layout</dt>
                      <dd className="mt-1 text-sm text-slate-800">
                        {event.venue.layoutNotes || "Not provided"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-400">Accessibility</dt>
                      <dd className="mt-1 text-sm text-slate-800">
                        {event.venue.accessibilityNotes || "Not provided"}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs font-medium text-slate-400">Required facilities</dt>
                      <dd className="mt-2 flex flex-wrap gap-1.5">
                        {event.venue.facilities.length > 0 ? (
                          event.venue.facilities.map((facility) => (
                            <span
                              key={facility}
                              className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600"
                            >
                              {facility}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-slate-500">None required</span>
                        )}
                      </dd>
                    </div>
                  </dl>
                </section>

                <SuggestedVenuesPanel eventId={eventId} />
              </div>
            </div>
          )}
        </div>
      </div>
    </RoleGate>
  );
}
