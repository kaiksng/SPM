import { CalendarDays, MapPin, Ticket } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { EventBannerImage } from "@/features/event-banners/components/event-banner-image";
import {
  listPublicEvents,
  type PublicEventSummary,
  type PublicRegistrationState,
} from "@/features/public-events/services/public-events";
import { cn } from "@/lib/utils";

const dateFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

const dayFormatter = new Intl.DateTimeFormat("en-SG", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Singapore",
});

function registrationLabel(event: PublicEventSummary): string {
  const labels: Record<PublicRegistrationState, string> = {
    open: "Registration open",
    not_open: event.opensAt ? `Opens ${dayFormatter.format(new Date(event.opensAt))}` : "Opening soon",
    closed: "Registration closed",
    full: "Full",
    not_required: "No registration needed",
  };
  return labels[event.registration];
}

/**
 * Upcoming events on the public main page. Each card leads to `linkTo`,
 * which for a signed-out visitor is sign-in, then the event.
 */
export function PublicEventGrid({ linkTo }: { linkTo: (eventId: string) => string }) {
  const [events, setEvents] = useState<PublicEventSummary[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    listPublicEvents()
      .then((items) => {
        if (active) setEvents(items);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "We couldn't load upcoming events.");
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <p role="alert" className="mt-6 rounded-2xl border border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
        {error}
      </p>
    );
  }

  if (!events) {
    return (
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
        {[0, 1, 2].map((key) => (
          <div key={key} className="h-72 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
        <span className="grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground">
          <Ticket className="size-5" aria-hidden="true" />
        </span>
        <h3 className="text-lg font-semibold">No upcoming events yet</h3>
        <p className="max-w-sm text-sm text-muted-foreground">Check back soon for what&apos;s on.</p>
      </div>
    );
  }

  return (
    <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {events.map((event) => (
        <li key={event.id}>
          <Link
            to={linkTo(event.id)}
            className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
          >
            <EventBannerImage bannerPath={event.bannerPath} />
            <div className="flex flex-1 flex-col p-5">
              <h3 className="text-lg font-semibold tracking-tight group-hover:text-primary">{event.title}</h3>
              <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
                {event.startsAt ? dateFormatter.format(new Date(event.startsAt)) : "Schedule to be announced"}
              </p>
              {event.location && (
                <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPin className="size-4 shrink-0" aria-hidden="true" />
                  {event.location}
                </p>
              )}
              <span
                className={cn(
                  "mt-4 w-fit rounded-full px-2.5 py-1 text-xs font-semibold",
                  event.registration === "open" && "bg-emerald-50 text-emerald-700",
                  event.registration === "not_open" && "bg-blue-50 text-blue-700",
                  event.registration === "not_required" && "bg-violet-50 text-violet-700",
                  (event.registration === "full" || event.registration === "closed") && "bg-muted text-muted-foreground",
                )}
              >
                {registrationLabel(event)}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
