import type { VenueBookingRequestSummary } from "@/features/venues/services/venue-bookings";

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
  | "disrupted";

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
 * became the main venue, replaced, disrupted. The same list feeds an event's
 * change history and a venue's Activity section, so both read the same way.
 * Built from the bookings' own columns, so it shows each booking's latest
 * state of every step, not a record of repeated changes.
 */
export function buildBookingActivity(
  bookings: VenueBookingRequestSummary[],
  disruptions: { bookingId: string; flaggedAt: string }[] = [],
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

  for (const disruption of disruptions) {
    const booking = bookings.find((item) => item.id === disruption.bookingId);
    if (!booking) continue;
    entries.push({
      id: `${booking.id}-disrupted`,
      at: disruption.flaggedAt,
      kind: "disrupted",
      title: "Disrupted",
      bookingId: booking.id,
      label: booking.label,
      venueName: booking.venueName,
      eventId: booking.eventId,
      eventTitle: booking.eventTitle,
      actor: null,
      detail: "The venue became unavailable for this booking. An alternative is needed.",
    });
  }

  return entries.sort((a, b) => b.at.localeCompare(a.at));
}
