import type { VenueBookingFlag } from "@/features/venues/services/venue-booking-flags";
import type { VenueBookingRequestSummary } from "@/features/venues/services/venue-bookings";

const periodFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

export type BookingActivityKind =
  | "requested"
  | "main"
  | "approved"
  | "rejected"
  | "withdrawn"
  | "cancelled"
  | "hold_expired"
  | "replacement_requested"
  | "replaced"
  | "disrupted"
  | "disruption_cleared"
  | "conflict_flagged"
  | "conflict_cleared";

/** One thing that happened to one venue booking: the unit of a venue activity log. */
export type BookingActivityEntry = {
  id: string;
  at: string;
  kind: BookingActivityKind;
  title: string;
  bookingId: string;
  label: string;
  venueName: string;
  eventId: string;
  eventTitle: string;
  actor: string | null;
  detail: string | null;
};

/**
 * Turns bookings into a time-ordered log, newest first: requested, approved or
 * rejected (with the reason), withdrawn or cancelled (with the reason),
 * became the main venue, replaced, and (given `flags`) disrupted or flagged
 * with a conflict, and each of those cleared. The same list feeds an event's
 * change history and a venue's Activity section, so both read the same way.
 * Built from the bookings' own columns, so it shows each booking's latest
 * state of every step, not a record of repeated changes; flags keep every
 * one, open or cleared.
 */
export function buildBookingActivity(
  bookings: VenueBookingRequestSummary[],
  flags: VenueBookingFlag[] = [],
): BookingActivityEntry[] {
  const entries: BookingActivityEntry[] = [];

  for (const booking of bookings) {
    const base = {
      bookingId: booking.id,
      label: booking.label,
      venueName: booking.venueName,
      eventId: booking.eventId,
      eventTitle: booking.eventTitle,
    };

    const requestedDetail = [
      booking.replacesBookingId
        ? `Replacement for the disrupted booking${booking.replacesVenueName ? ` at ${booking.replacesVenueName}` : ""}`
        : null,
      booking.expectedHeadcount != null ? `${booking.expectedHeadcount} people` : null,
    ].filter(Boolean);
    entries.push({
      ...base,
      id: `${booking.id}-requested`,
      at: booking.requestedAt,
      kind: "requested",
      title: "Requested",
      actor: booking.requestedByName,
      detail: requestedDetail.length > 0 ? requestedDetail.join(" · ") : null,
    });

    // The first booking is main from the moment it is requested, which is not news.
    if (
      booking.mainDesignatedAt
      && !booking.replacesBookingId
      && booking.mainDesignatedAt !== booking.requestedAt
    ) {
      entries.push({
        ...base,
        id: `${booking.id}-main`,
        at: booking.mainDesignatedAt,
        kind: "main",
        title: "Became the main venue",
        actor: null,
        detail: null,
      });
    }

    if (booking.decidedAt) {
      const rejected = booking.status === "rejected";
      entries.push({
        ...base,
        id: `${booking.id}-decision`,
        at: booking.decidedAt,
        kind: rejected ? "rejected" : "approved",
        title: rejected ? "Rejected" : "Approved",
        actor: booking.decidedByName,
        detail: booking.decisionNotes,
      });
    }

    if (booking.status === "cancelled" && booking.cancelledAt) {
      // Only an approved booking has a decision, so this tells the two apart.
      const wasApproved = booking.decidedAt !== null;
      entries.push({
        ...base,
        id: `${booking.id}-released`,
        at: booking.cancelledAt,
        kind: wasApproved ? "cancelled" : "withdrawn",
        title: wasApproved ? "Cancelled" : "Withdrawn",
        actor: booking.cancelledByName,
        detail: booking.cancellationReason,
      });
    }

    if (booking.status === "expired" && booking.expiresAt) {
      entries.push({
        ...base,
        id: `${booking.id}-hold-expired`,
        at: booking.expiresAt,
        kind: "hold_expired",
        title: "Hold expired",
        actor: null,
        detail: null,
      });
    }

    const replacement = bookings.find(
      (other) =>
        other.replacesBookingId === booking.id
        && (other.status === "approved" || other.status === "pending"),
    );
    if (replacement) {
      const approved = replacement.status === "approved";
      entries.push({
        ...base,
        id: `${booking.id}-replacement`,
        at: approved && replacement.decidedAt ? replacement.decidedAt : replacement.requestedAt,
        kind: approved ? "replaced" : "replacement_requested",
        title: approved ? "Replaced" : "Replacement requested",
        actor: null,
        detail: approved
          ? `Replaced by the booking at ${replacement.venueName}`
          : `Replacement requested at ${replacement.venueName}`,
      });
    }
  }

  for (const flag of flags) {
    const booking = bookings.find((item) => item.id === flag.bookingId);
    if (!booking) continue;
    const base = {
      bookingId: booking.id,
      label: booking.label,
      venueName: booking.venueName,
      eventId: booking.eventId,
      eventTitle: booking.eventTitle,
    };
    const block = flag.blockReason !== null || flag.blockStartsAt !== null
      ? `the venue block "${flag.blockReason ?? "Reason not recorded"}"${
          flag.blockStartsAt && flag.blockEndsAt
            ? ` (${periodFormatter.format(new Date(flag.blockStartsAt))} – ${periodFormatter.format(new Date(flag.blockEndsAt))})`
            : ""
        }`
      : null;
    const otherSide = block ?? `the booking for "${flag.conflictingEventTitle ?? "another event"}"`;

    if (flag.kind === "disruption") {
      entries.push({
        ...base,
        id: `${flag.id}-flagged`,
        at: flag.flaggedAt,
        kind: "disrupted",
        title: "Disrupted",
        actor: flag.flaggedByName,
        detail: `The venue became unavailable for this booking because of ${otherSide}. An alternative is needed.`,
      });
      if (flag.clearedAt) {
        entries.push({
          ...base,
          id: `${flag.id}-cleared`,
          at: flag.clearedAt,
          kind: "disruption_cleared",
          title: "Disruption cleared",
          actor: flag.clearedByName,
          detail: `No longer affected by ${otherSide}.`,
        });
      }
    } else {
      entries.push({
        ...base,
        id: `${flag.id}-flagged`,
        at: flag.flaggedAt,
        kind: "conflict_flagged",
        title: "Conflict flagged",
        actor: flag.flaggedByName,
        detail: `Overlaps ${otherSide} once setup/turnaround time is applied.`,
      });
      if (flag.clearedAt) {
        entries.push({
          ...base,
          id: `${flag.id}-cleared`,
          at: flag.clearedAt,
          kind: "conflict_cleared",
          title: "Conflict cleared",
          actor: flag.clearedByName,
          detail: `No longer overlaps ${otherSide}.`,
        });
      }
    }
  }

  return entries.sort((a, b) => b.at.localeCompare(a.at));
}
