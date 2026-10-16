import type { DayCode, OperatingHours } from "@spm/shared";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { DateClickArg } from "@fullcalendar/interaction";
import type { EventContentArg, EventInput } from "@fullcalendar/core";
import FullCalendar from "@fullcalendar/react";
import { ArrowLeft } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";

import { useAuth } from "@/context/auth-context";
import { buttonVariants } from "@/components/ui/button";
import "@/features/venues/components/venue-calendar.css";
import {
  listVenueAvailability,
  type VenueAvailabilityPeriod,
} from "@/features/venues/services/venue-availability";
import { getVenue, type VenueDetail } from "@/features/venues/services/venues";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

/**
 * What the calendar actually renders, one level removed from the raw
 * booking status. Pending and On Hold always show their real detail to
 * every viewer — they're not "someone else's private request" the way a
 * Confirmed booking is; a Confirmed booking that isn't the viewer's own
 * collapses to a generic "reserved" (Booked, unavailable to you) so a
 * fellow coordinator or Venue Staff only learns the slot is taken, not
 * whose event it is. Blocked is never masked either (no requester to hide).
 */
type VenueCalendarDisplayStatus = "pending" | "on_hold" | "confirmed" | "reserved" | "blocked";

function toDisplayStatus(period: VenueAvailabilityPeriod): VenueCalendarDisplayStatus {
  if (period.type !== "confirmed") return period.type;
  return period.isMine ? "confirmed" : "reserved";
}

/** Short title for the month view — day belt below shows the full detail. */
function toDisplayTitle(period: VenueAvailabilityPeriod): string {
  if (period.type === "blocked") return period.label ?? "Reason not recorded";
  return period.label ?? "Booking";
}

const STATUS_COLORS = {
  pending: { backgroundColor: "#fffbeb", borderColor: "#fde68a", textColor: "#b45309" },
  on_hold: { backgroundColor: "#eef2ff", borderColor: "#c7d2fe", textColor: "#4338ca" },
  confirmed: { backgroundColor: "#ecfdf5", borderColor: "#a7f3d0", textColor: "#047857" },
  // Pink, not a paler red — otherwise this reads as a faint variant of
  // Blocked instead of its own distinct status.
  reserved: { backgroundColor: "#fce7f3", borderColor: "#f9a8d4", textColor: "#be185d" },
  blocked: { backgroundColor: "#dc2626", borderColor: "#dc2626", textColor: "#ffffff" },
} as const satisfies Record<VenueCalendarDisplayStatus, object>;

// The venue's home timezone — every other date/time display in this app
// (VenueDetailPage, EventsPage) hardcodes this rather than trusting the
// viewer's browser locale, and the day strip below needs to agree with the
// calendar on where a day's boundary falls.
const TIME_ZONE = "Asia/Singapore";

function toEvents(periods: VenueAvailabilityPeriod[]): EventInput[] {
  return periods.map((period) => {
    const status = toDisplayStatus(period);
    return {
      id: period.id,
      title: toDisplayTitle(period),
      // Floating (no 'Z'/offset) Singapore wall-clock strings: FullCalendar
      // takes an offset-less string as already being in its configured
      // `timeZone` prop, so day-grid placement can't be thrown off by its
      // own UTC-to-zone conversion — a booking starting 6:00 AM Monday in
      // Singapore (10:00 PM Sunday UTC) was still drawing its bar starting
      // Sunday even with timeZone="Asia/Singapore" and allDay:false set.
      start: toSingaporeFloatingIso(period.startsAt),
      end: toSingaporeFloatingIso(period.endsAt),
      allDay: false,
      ...STATUS_COLORS[status],
      extendedProps: { status },
    };
  });
}

/** Month view gets a small status dot and a truncated booking title or block reason. */
function renderEventContent(arg: EventContentArg) {
  const status = arg.event.extendedProps.status as VenueCalendarDisplayStatus;
  return (
    <div className="venue-calendar__month-event">
      <span className={`venue-calendar__dot venue-calendar__dot--${status}`} />
      <span className={`venue-calendar__month-title venue-calendar__month-title--${status}`}>
        {arg.event.title}
      </span>
    </div>
  );
}

function singaporeDateStr(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
}

/**
 * A UTC instant, rewritten as a timezone-naive "YYYY-MM-DDTHH:mm:ss" string
 * holding its Singapore wall-clock time. Handed to FullCalendar instead of
 * the raw offset-bearing ISO string: with `timeZone={TIME_ZONE}` configured,
 * FullCalendar treats a string with no 'Z'/offset as already being in that
 * zone, so day-grid placement can't be thrown off by whatever its own
 * UTC-to-zone conversion does with an explicit offset (a 6:00 AM Monday
 * Singapore booking, 10:00 PM Sunday UTC, was drawing one day early even
 * with the timeZone prop and allDay:false both set — converting ourselves
 * removes FullCalendar's conversion from the equation entirely).
 */
function toSingaporeFloatingIso(isoString: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(isoString));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
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

/** "09:00" -> 9, "18:30" -> 18.5. */
function timeToHour(time: string): number {
  const [hourStr, minuteStr] = time.split(":");
  return Number(hourStr) + Number(minuteStr) / 60;
}

/** Lowercase 3-letter weekday code (e.g. "mon") for `dateStr` in TIME_ZONE. */
function dayCodeForDate(dateStr: string): DayCode {
  const date = new Date(`${dateStr}T00:00:00+08:00`);
  return new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short" })
    .format(date)
    .toLowerCase()
    .slice(0, 3) as DayCode;
}

/**
 * The venue's open/close hours for `dayCode`, read directly off its
 * structured operating hours — the period whose `days` includes it, if any.
 * No period covering that day means the venue is closed that day; there is
 * no default window to fall back to.
 */
function hoursForDay(
  operatingHours: OperatingHours,
  dayCode: DayCode,
): { startHour: number; endHour: number } | null {
  const period = operatingHours.find((candidate) => candidate.days.includes(dayCode));
  if (!period) return null;
  return { startHour: timeToHour(period.opensAt), endHour: timeToHour(period.closesAt) };
}

/** Whether the venue has no operating-hours period covering `dateStr` at all. */
function isClosedDate(operatingHours: OperatingHours, dateStr: string): boolean {
  return hoursForDay(operatingHours, dayCodeForDate(dateStr)) === null;
}

type BeltPeriod = VenueAvailabilityPeriod & {
  startHour: number;
  endHour: number;
  // Only present when this period is a booking (not a block — a block has
  // no setup/turnaround of its own) AND the venue has a nonzero value AND
  // the segment actually falls within this day/belt's visible bounds.
  setupStartHour?: number;
  setupEndHour?: number;
  turnaroundStartHour?: number;
  turnaroundEndHour?: number;
};

/**
 * Clips [start, end) to `dateStr`'s day and [beltStartHour, beltEndHour],
 * returning null if the range doesn't touch that window at all. Shared by
 * a period's own bounds and its setup/turnaround segments below — same
 * clipping rules either way.
 */
function clipRangeToDay(
  start: Date,
  end: Date,
  dayStart: Date,
  dayEnd: Date,
  beltStartHour: number,
  beltEndHour: number,
): { startHour: number; endHour: number } | null {
  if (end <= dayStart || start >= dayEnd) return null;

  const startHour = Math.max(
    singaporeHour(start < dayStart ? dayStart : start),
    beltStartHour,
  );
  const endHour = Math.min(
    // singaporeHour(end) only reads end's time-of-day, ignoring which
    // calendar date it falls on — fine for a period that ends today, but
    // wrong for a multi-day period's earlier days: on day 1 of a 3-day
    // booking, "end" is two days away, yet its raw clock time (e.g.
    // 15:10) would be read as if the booking also stopped at 15:10
    // *today*, instead of running through to midnight. `end >= dayEnd`
    // catches every day the period continues past (not just the single
    // case where it ends exactly at midnight), so day 1 (and any full
    // day in between) correctly fills through to the end of the belt.
    end >= dayEnd ? 24 : singaporeHour(end),
    beltEndHour,
  );

  return endHour > startHour ? { startHour, endHour } : null;
}

/** Periods overlapping `dateStr` (a TIME_ZONE-local "YYYY-MM-DD"), clipped to [beltStartHour, beltEndHour]. */
function periodsForDate(
  periods: VenueAvailabilityPeriod[],
  dateStr: string,
  beltStartHour: number,
  beltEndHour: number,
  setupMinutes: number,
  turnaroundMinutes: number,
): BeltPeriod[] {
  const dayStart = new Date(`${dateStr}T00:00:00+08:00`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  return periods
    .map((period): BeltPeriod | null => {
      const start = new Date(period.startsAt);
      const end = new Date(period.endsAt);
      const clipped = clipRangeToDay(start, end, dayStart, dayEnd, beltStartHour, beltEndHour);
      if (!clipped) return null;

      const result: BeltPeriod = { ...period, startHour: clipped.startHour, endHour: clipped.endHour };

      // A block has no setup/turnaround of its own — only bookings do.
      if (period.type !== "blocked") {
        if (setupMinutes > 0) {
          const setupStart = new Date(start.getTime() - setupMinutes * 60_000);
          const setupClip = clipRangeToDay(setupStart, start, dayStart, dayEnd, beltStartHour, beltEndHour);
          if (setupClip) {
            result.setupStartHour = setupClip.startHour;
            result.setupEndHour = setupClip.endHour;
          }
        }
        if (turnaroundMinutes > 0) {
          const turnaroundEnd = new Date(end.getTime() + turnaroundMinutes * 60_000);
          const turnaroundClip = clipRangeToDay(end, turnaroundEnd, dayStart, dayEnd, beltStartHour, beltEndHour);
          if (turnaroundClip) {
            result.turnaroundStartHour = turnaroundClip.startHour;
            result.turnaroundEndHour = turnaroundClip.endHour;
          }
        }
      }

      return result;
    })
    .filter((period): period is BeltPeriod => period !== null)
    .sort((a, b) => a.startHour - b.startHour);
}

export function VenueAvailabilityPage() {
  const { venueId } = useParams();
  const { user } = useAuth();
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
    Promise.all([getVenue(venueId), listVenueAvailability(venueId, user?.id ?? null)])
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
  }, [venueId, user?.id]);

  const events = useMemo(() => toEvents(periods), [periods]);
  const selectedDayCode = useMemo(() => dayCodeForDate(selectedDate), [selectedDate]);
  const dayHours = useMemo(
    () => (venue ? hoursForDay(venue.operatingHours, selectedDayCode) : null),
    [venue, selectedDayCode],
  );
  // The day timebelt is where setup/turnaround is shown distinctly — unlike
  // the month view above, it's plain positioned divs, not FullCalendar, so
  // it isn't subject to FullCalendar's background-event rendering gap for
  // sub-day ranges (the reason "Blocked" is a solid event there, not one).
  const setupMinutes = Number(venue?.setupTimeMinutes) || 0;
  const turnaroundMinutes = Number(venue?.turnaroundTimeMinutes) || 0;
  const beltPeriods = useMemo(
    () =>
      dayHours
        ? periodsForDate(periods, selectedDate, dayHours.startHour, dayHours.endHour, setupMinutes, turnaroundMinutes)
        : [],
    [periods, selectedDate, dayHours, setupMinutes, turnaroundMinutes],
  );

  function handleDateClick(arg: DateClickArg) {
    if (venue && isClosedDate(venue.operatingHours, arg.dateStr)) return;
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
              <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
                Venue availability
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-950">
                {venue.name}
              </h1>
              <p className="mt-2 text-sm text-slate-600">{venue.location}</p>

              <div className="mt-6 flex flex-wrap gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-medium text-slate-600">
                <Legend swatchClassName="border border-slate-200 bg-white" label="Available" square />
                <Legend swatchClassName="border border-amber-200 bg-amber-50" label="Pending Booking" />
                <Legend swatchClassName="border border-indigo-200 bg-indigo-50" label="On Hold" />
                <Legend
                  swatchClassName="border border-emerald-200 bg-emerald-50"
                  label="Your confirmed booking"
                />
                <Legend
                  swatchClassName="venue-calendar__striped border border-pink-300 bg-pink-100"
                  label="Booked (unavailable to you)"
                />
                <Legend swatchClassName="bg-red-600" label="Blocked" />
                <Legend
                  swatchClassName="venue-calendar__buffer-swatch border border-slate-300 bg-slate-100"
                  label="Setup / turnaround"
                  square
                />
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
                    dayCellClassNames={(arg) => {
                      const dateStr = singaporeDateStr(arg.date);
                      const classes: string[] = [];
                      if (dateStr === selectedDate) classes.push("venue-calendar__selected-day");
                      if (venue && isClosedDate(venue.operatingHours, dateStr)) {
                        classes.push("venue-calendar__closed-day");
                      }
                      return classes;
                    }}
                  />
                </div>
              </section>

              <DayTimebelt
                date={selectedDate}
                periods={beltPeriods}
                startHour={dayHours?.startHour ?? 0}
                endHour={dayHours?.endHour ?? 0}
                closed={!dayHours}
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
  square,
}: {
  swatchClassName: string;
  label: string;
  /** Available is a square (it's an outline, not a filled dot, so the
   * default rounding read as a circle); every other status stays a circle,
   * matching the dot shown on the calendar itself. */
  square?: boolean;
}) {
  return (
    <span className="flex items-center gap-2">
      <span
        className={`size-2.5 ${square ? "" : "rounded-full"} ${swatchClassName}`}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

const BELT_STATUS_STYLES = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  on_hold: "border-indigo-200 bg-indigo-50 text-indigo-700",
  confirmed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  // Pink with diagonal hatching, not a flat paler red — the hatching gives
  // it its own texture on top of the hue split from Blocked.
  reserved: "venue-calendar__striped border-pink-300 bg-pink-100 text-pink-700",
  blocked: "border-red-600 bg-red-600 text-white",
} as const satisfies Record<VenueCalendarDisplayStatus, string>;

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
  closed,
}: {
  date: string;
  periods: BeltPeriod[];
  startHour: number;
  endHour: number;
  /** True when the venue has no operating-hours period covering this day. */
  closed: boolean;
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
          {closed ? "Closed" : <>{formatHour(startHour)} &ndash; {formatHour(endHour)}</>}
        </span>
      </div>

      {closed ? (
        <p className="mt-4 flex h-40 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
          Closed all day
        </p>
      ) : (
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
            const status = toDisplayStatus(period);

            return (
              <Fragment key={period.id}>
                {period.setupStartHour !== undefined && period.setupEndHour !== undefined && (
                  <div
                    className="venue-calendar__buffer-bar absolute inset-x-2 overflow-hidden rounded-lg"
                    style={{
                      top: `calc(${((period.setupStartHour - startHour) / hourCount) * 100}% + 2px)`,
                      height: `calc(${((period.setupEndHour - period.setupStartHour) / hourCount) * 100}% - 4px)`,
                    }}
                  >
                    <span className="venue-calendar__buffer-label">Setup</span>
                  </div>
                )}
              <div
                className={`absolute inset-x-2 overflow-hidden rounded-lg border ${BELT_STATUS_STYLES[status]}`}
                style={{ top: `calc(${top}% + 2px)`, height: `calc(${height}% - 4px)` }}
              >
                {status === "blocked" ? (
                  <div
                    className="flex h-full flex-col items-center justify-center px-2 py-0.5 text-center leading-tight"
                    title={`${timeText} — ${period.label}`}
                    aria-label={`Blocked ${timeText}. ${period.label}`}
                  >
                    <p className="text-xs font-semibold">{timeText}</p>
                    <p className="max-w-full truncate text-[11px] font-medium opacity-95">
                      {period.label}
                    </p>
                  </div>
                ) : (
                  <div
                    className="flex h-full flex-col gap-1.5 overflow-hidden px-2.5 py-2"
                    title={[
                      timeText,
                      period.label,
                      period.organiserName && `Booked by ${period.organiserName}`,
                      period.coordinatorName && `Coordinator ${period.coordinatorName}`,
                      period.heldByName && `Held by ${period.heldByName}`,
                    ]
                      .filter(Boolean)
                      .join(" — ")}
                  >
                    <div className="leading-tight">
                      <p className="text-xs font-semibold">{timeText}</p>
                      <p className="truncate text-xs font-medium opacity-95">{period.label}</p>
                    </div>
                    <div className="flex flex-col gap-1 leading-tight">
                      {period.type === "on_hold" && period.heldByName && (
                        <p className="truncate text-[11px] opacity-85">
                          Held by {period.heldByName}
                        </p>
                      )}
                      {period.organiserName && (
                        <p className="truncate text-[11px] opacity-85">
                          Booked by {period.organiserName}
                        </p>
                      )}
                      {period.coordinatorName && (
                        <p className="truncate text-[11px] opacity-85">
                          Coordinator: {period.coordinatorName}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
                {period.turnaroundStartHour !== undefined && period.turnaroundEndHour !== undefined && (
                  <div
                    className="venue-calendar__buffer-bar absolute inset-x-2 overflow-hidden rounded-lg"
                    style={{
                      top: `calc(${((period.turnaroundStartHour - startHour) / hourCount) * 100}% + 2px)`,
                      height: `calc(${((period.turnaroundEndHour - period.turnaroundStartHour) / hourCount) * 100}% - 4px)`,
                    }}
                  >
                    <span className="venue-calendar__buffer-label">Turnaround</span>
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
      </div>
      )}
    </section>
  );
}
