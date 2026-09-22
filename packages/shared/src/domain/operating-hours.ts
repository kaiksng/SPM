import type { DayCode, OperatingHours } from "../types/venue";

const DAY_ORDER: DayCode[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const DAY_LABELS: Record<DayCode, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

/** "09:00" -> "9:00 AM", "18:00" -> "6:00 PM". */
function formatTime(time: string): string {
  const [hourStr, minuteStr] = time.split(":");
  const hour = Number(hourStr);
  const period = hour >= 12 ? "PM" : "AM";
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelveHour}:${minuteStr} ${period}`;
}

/** Consecutive-day runs in DAY_ORDER, e.g. ["mon","tue","wed"] -> "Mon–Wed", ["mon","wed"] -> "Mon, Wed". */
function formatDayList(days: DayCode[]): string {
  const sorted = [...days].sort(
    (a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b),
  );

  const ranges: DayCode[][] = [];
  for (const day of sorted) {
    const lastRange = ranges[ranges.length - 1];
    const lastDay = lastRange?.[lastRange.length - 1];
    if (
      lastRange &&
      lastDay &&
      DAY_ORDER.indexOf(day) === DAY_ORDER.indexOf(lastDay) + 1
    ) {
      lastRange.push(day);
    } else {
      ranges.push([day]);
    }
  }

  return ranges
    .map((range) =>
      range.length > 1
        ? `${DAY_LABELS[range[0]!]}–${DAY_LABELS[range[range.length - 1]!]}`
        : DAY_LABELS[range[0]!],
    )
    .join(", ");
}

/**
 * Human-readable summary of a venue's structured operating hours, e.g.
 * "Mon–Fri 9:00 AM – 6:00 PM, Sat–Sun Closed". Shared by VenuesPage's card
 * and VenueDetailPage so both render the exact same text.
 */
export function formatOperatingHours(periods: OperatingHours): string {
  if (periods.length === 0) return "Operating hours not set";

  const covered = new Set<DayCode>();
  const openSegments = periods.map((period) => {
    for (const day of period.days) covered.add(day);
    return `${formatDayList(period.days)} ${formatTime(period.opensAt)} – ${formatTime(period.closesAt)}`;
  });

  const closedDays = DAY_ORDER.filter((day) => !covered.has(day));
  const closedSegment = closedDays.length > 0 ? [`${formatDayList(closedDays)} Closed`] : [];

  return [...openSegments, ...closedSegment].join(", ");
}
