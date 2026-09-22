import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { DateClickArg } from "@fullcalendar/interaction";
import type { EventContentArg, EventInput } from "@fullcalendar/core";
import FullCalendar from "@fullcalendar/react";
import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";

import { buttonVariants } from "@/components/ui/button";
import "@/features/venues/components/venue-calendar.css";
import {
  listVenueAvailability,
  type VenueAvailabilityPeriod,
  type VenueAvailabilityStatus,
} from "@/features/venues/services/venue-availability";
import { getVenue, type VenueDetail } from "@/features/venues/services/venues";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

const STATUS_COLORS = {
  pending: { backgroundColor: "#fffbeb", borderColor: "#fde68a", textColor: "#b45309" },
  confirmed: { backgroundColor: "#ecfdf5", borderColor: "#a7f3d0", textColor: "#047857" },
  blocked: { backgroundColor: "#dc2626", borderColor: "#dc2626", textColor: "#ffffff" },
} as const satisfies Record<VenueAvailabilityStatus, object>;

// The venue's home timezone — every other date/time display in this app
// (VenueDetailPage, EventsPage) hardcodes this rather than trusting the
// viewer's browser locale, and the day strip below needs to agree with the
// calendar on where a day's boundary falls.
const TIME_ZONE = "Asia/Singapore";
const DEFAULT_BELT_START_HOUR = 8;
const DEFAULT_BELT_END_HOUR = 20;

function toEvents(periods: VenueAvailabilityPeriod[]): EventInput[] {
  return periods.map((period) => ({
    id: period.id,
    title: period.label ?? "",
    start: period.startsAt,
    end: period.endsAt,
    ...STATUS_COLORS[period.type],
    extendedProps: { type: period.type },
  }));
}

/** Month view gets a small status dot + truncated title (blocked has no title, just the dot). */
function renderEventContent(arg: EventContentArg) {
  const type = arg.event.extendedProps.type as VenueAvailabilityStatus;
  return (
    <div className="venue-calendar__month-event">
      <span className={`venue-calendar__dot venue-calendar__dot--${type}`} />
      <span className="venue-calendar__month-title">{arg.event.title}</span>
    </div>
  );
}

function singaporeDateStr(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
}

/** Hour-of-day (e.g. 13.5 for 1:30pm) that `date` falls on in TIME_ZONE. */
function singaporeHour(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour + minute / 60;
}

function formatHour(hour: number): string {
  const wholeHour = Math.floor(hour) % 24;
  const period = wholeHour >= 12 ? "PM" : "AM";
  const twelveHour = wholeHour % 12 === 0 ? 12 : wholeHour % 12;
  const minute = Math.round((hour - Math.floor(hour)) * 60);
  return `${twelveHour}${minute ? ":" + String(minute).padStart(2, "0") : ""} ${period}`;
}

/**
 * Venues store operating hours as free text (e.g. "Mon-Fri, 6am to 9pm"),
 * not structured start/end fields, so this reads the first and last
 * clock-time mentions out of it rather than parsing the whole sentence.
 * Falls back to the default window for anything it can't confidently read
 * (e.g. "24 hours", "By appointment") rather than guessing.
 */
function parseOperatingHours(
  text: string,
): { startHour: number; endHour: number } | null {
  const toHour = (hourStr: string, minuteStr: string | undefined, meridiem: string | undefined) => {
    let hour = Number(hourStr);
    const minute = minuteStr ? Number(minuteStr) : 0;
    if (meridiem) {
      const isPm = meridiem.toLowerCase() === "pm";
      if (isPm && hour !== 12) hour += 12;
      if (!isPm && hour === 12) hour = 0;
    }
    return hour + minute / 60;
  };

  const twelveHourMatches = [...text.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi)].map(
    (match) => toHour(match[1]!, match[2], match[3]),
  );
  const matches =
    twelveHourMatches.length >= 2
      ? twelveHourMatches
      : [...text.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g)].map((match) =>
          toHour(match[1]!, match[2], undefined),
        );

  if (matches.length < 2) return null;

  const startHour = Math.floor(matches[0]!);
  const endHour = Math.ceil(matches[matches.length - 1]!);
  return endHour > startHour ? { startHour, endHour } : null;
}

type BeltPeriod = VenueAvailabilityPeriod & { startHour: number; endHour: number };

/** Periods overlapping `dateStr` (a TIME_ZONE-local "YYYY-MM-DD"), clipped to [beltStartHour, beltEndHour]. */
function periodsForDate(
  periods: VenueAvailabilityPeriod[],
  dateStr: string,
  beltStartHour: number,
  beltEndHour: number,
): BeltPeriod[] {
  const dayStart = new Date(`${dateStr}T00:00:00+08:00`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  return periods
    .map((period): BeltPeriod | null => {
      const start = new Date(period.startsAt);
      const end = new Date(period.endsAt);
      if (end <= dayStart || start >= dayEnd) return null;

      const startHour = Math.max(
        singaporeHour(start < dayStart ? dayStart : start),
        beltStartHour,
      );
      const endHour = Math.min(
        // A period ending exactly at midnight reads as hour 0, not 24 — bump
        // it back up so it clips to the end of the belt instead of vanishing.
        end.getTime() === dayEnd.getTime() ? 24 : singaporeHour(end),
        beltEndHour,
      );

      return endHour > startHour ? { ...period, startHour, endHour } : null;
    })
    .filter((period): period is BeltPeriod => period !== null)
    .sort((a, b) => a.startHour - b.startHour);
}

export function VenueAvailabilityPage() {
  const { venueId } = useParams();
  const [venue, setVenue] = useState<VenueDetail>();
  const [periods, setPeriods] = useState<VenueAvailabilityPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [selectedDate, setSelectedDate] = useState(() => singaporeDateStr(new Date()));

  usePageTitle(venue ? `${venue.name} — Availability` : "Venue availability");

  useEffect(() => {
    if (!venueId) return;
    let active = true;
    setLoading(true);
    Promise.all([getVenue(venueId), listVenueAvailability(venueId)])
      .then(([venueDetail, venuePeriods]) => {
        if (!active) return;
        setVenue(venueDetail);
        setPeriods(venuePeriods);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "This venue is unavailable or you do not have access to it.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [venueId]);

  const events = useMemo(() => toEvents(periods), [periods]);
  const beltHours = useMemo(
    () =>
      (venue && parseOperatingHours(venue.operatingHours)) ?? {
        startHour: DEFAULT_BELT_START_HOUR,
        endHour: DEFAULT_BELT_END_HOUR,
      },
    [venue],
  );
  const beltPeriods = useMemo(
    () => periodsForDate(periods, selectedDate, beltHours.startHour, beltHours.endHour),
    [periods, selectedDate, beltHours],
  );

  function handleDateClick(arg: DateClickArg) {
    setSelectedDate(arg.dateStr);
  }

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-5xl">
          <Link
            to={`/venues/${venueId}`}
            className={buttonVariants({ variant: "ghost", className: "-ml-2" })}
          >
            <ArrowLeft /> Back to {venue?.name ?? "venue"}
          </Link>

          {loading ? (
            <div className="mt-7 h-[600px] animate-pulse rounded-2xl bg-slate-200/70 motion-reduce:animate-none" />
          ) : error || !venue ? (
            <section className="mt-7 rounded-2xl border border-red-200 bg-red-50 p-6">
              <h1 className="font-semibold text-red-900">
                Availability unavailable
              </h1>
              <p role="alert" className="mt-2 text-sm text-red-800">
                {error ?? "This venue could not be found."}
              </p>
            </section>
          ) : (
            <div className="mt-6">
              <p className="text-xs font-semibold tracking-[0.16em] text-blue-600 uppercase">
                Venue availability
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-950">
                {venue.name}
              </h1>
              <p className="mt-2 text-sm text-slate-600">{venue.location}</p>

              <div className="mt-6 flex flex-wrap gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-medium text-slate-600">
                <Legend swatchClassName="border border-slate-200 bg-white" label="Available" />
                <Legend
                  swatchClassName="border border-amber-200 bg-amber-50"
                  label="Pending booking"
                />
                <Legend
                  swatchClassName="border border-emerald-200 bg-emerald-50"
                  label="Confirmed booking"
                />
                <Legend swatchClassName="bg-red-600" label="Blocked" />
              </div>

              <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
                <div className="venue-calendar">
                  <FullCalendar
                    plugins={[dayGridPlugin, interactionPlugin]}
                    initialView="dayGridMonth"
                    timeZone={TIME_ZONE}
                    headerToolbar={{ left: "prev,next today", center: "title", right: "" }}
                    height="auto"
                    events={events}
                    eventContent={renderEventContent}
                    dateClick={handleDateClick}
                    dayCellClassNames={(arg) =>
                      singaporeDateStr(arg.date) === selectedDate
                        ? ["venue-calendar__selected-day"]
                        : []
                    }
                  />
                </div>
              </section>

              <DayTimebelt
                date={selectedDate}
                periods={beltPeriods}
                startHour={beltHours.startHour}
                endHour={beltHours.endHour}
              />
            </div>
          )}
        </div>
      </div>
    </RoleGate>
  );
}

function Legend({
  swatchClassName,
  label,
}: {
  swatchClassName: string;
  label: string;
}) {
  return (
    <span className="flex items-center gap-2">
      <span className={`size-2.5 rounded-sm ${swatchClassName}`} aria-hidden="true" />
      {label}
    </span>
  );
}

const BELT_STATUS_STYLES = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  confirmed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  blocked: "border-red-600 bg-red-600 text-white",
} as const satisfies Record<VenueAvailabilityStatus, string>;

/**
 * A single selected day's hour-by-hour breakdown, updated by clicking a date
 * in the calendar above. Kept separate from FullCalendar entirely — clicking
 * a date narrows what's shown here rather than replacing the month view.
 */
function DayTimebelt({
  date,
  periods,
  startHour,
  endHour,
}: {
  date: string;
  periods: BeltPeriod[];
  startHour: number;
  endHour: number;
}) {
  const hourCount = endHour - startHour;
  const hours = Array.from({ length: hourCount }, (_, index) => startHour + index);
  const dateLabel = new Intl.DateTimeFormat("en-SG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TIME_ZONE,
  }).format(new Date(`${date}T00:00:00+08:00`));

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-base font-semibold tracking-tight text-slate-950">
          {dateLabel}
        </h2>
        <span className="text-xs font-medium text-slate-400">
          {formatHour(startHour)} &ndash; {formatHour(endHour)}
        </span>
      </div>

      <div className="mt-4 flex overflow-hidden rounded-xl border border-slate-200">
        <div className="w-16 shrink-0 border-r border-slate-200 bg-slate-50">
          {hours.map((hour, index) => (
            <div key={hour} className="relative h-14 border-t border-slate-100 first:border-t-0">
              {/* The label sits just above its gridline (so "9 AM" marks
                  where 9 AM starts, not the middle of the 9-10 row) — except
                  the very first one, which has no room above the box to float
                  into and just sits at the top of its own row instead. */}
              <span
                className={`absolute right-2 text-[11px] font-medium text-slate-400 ${index === 0 ? "top-1" : "-top-2"}`}
              >
                {formatHour(hour)}
              </span>
            </div>
          ))}
        </div>

        <div className="relative flex-1">
          {hours.map((hour) => (
            <div key={hour} className="h-14 border-t border-slate-100 first:border-t-0" />
          ))}

          {periods.length === 0 && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
              Available all day
            </p>
          )}

          {periods.map((period) => {
            const top = ((period.startHour - startHour) / hourCount) * 100;
            const height = ((period.endHour - period.startHour) / hourCount) * 100;
            const timeText = `${formatHour(period.startHour)} – ${formatHour(period.endHour)}`;

            return (
              <div
                key={period.id}
                className={`absolute inset-x-2 overflow-hidden rounded-lg border ${BELT_STATUS_STYLES[period.type]}`}
                style={{ top: `calc(${top}% + 2px)`, height: `calc(${height}% - 4px)` }}
              >
                {period.type === "blocked" ? (
                  <div className="flex h-full items-center justify-center px-2 text-center text-xs font-semibold">
                    {timeText}
                  </div>
                ) : (
                  <div className="px-2.5 py-1.5 leading-tight">
                    <p className="text-xs font-semibold">{timeText}</p>
                    <p className="truncate text-xs opacity-85">{period.label}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
