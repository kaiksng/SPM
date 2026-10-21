import type { EventReadiness, ReadinessStatus } from "@spm/shared";

import { VenueBookingStatusBadge } from "@/features/venues/components/venue-booking-status-badge";
import {
  groupEquipmentByReadiness,
  groupVenueBookingsByReadiness,
  type GroupedEquipmentRequirement,
  type GroupedVenueBooking,
} from "@/features/event-requests/services/confirmed-arrangements";
import type { EventDetail } from "@/features/event-requests/services/event-details";
import { READINESS_ITEM_BADGE_CLASSES } from "@/features/safety-check/services/event-readiness";
import type { VenueBookingRequestSummary } from "@/features/venues/services/venue-bookings";

const dateTimeFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

const READINESS_BADGE_LABELS: Record<ReadinessStatus | "not_required", string> = {
  complete: "Confirmed",
  pending: "Pending",
  needs_review: "Needs Review",
  not_required: "Not Required",
};

function ReadinessBadge({ status }: { status: ReadinessStatus | "not_required" }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${READINESS_ITEM_BADGE_CLASSES[status]}`}
    >
      {READINESS_BADGE_LABELS[status]}
    </span>
  );
}

function formatPeriod(startsAt: string, endsAt: string) {
  return `${dateTimeFormatter.format(new Date(startsAt))} – ${dateTimeFormatter.format(new Date(endsAt))}`;
}

function VenueBookingRow({ booking }: { booking: GroupedVenueBooking }) {
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-900">{booking.label}</span>
        {booking.isMainVenue && (
          <span className="inline-block rounded-full border border-primary/30 bg-accent px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-primary">
            Main venue
          </span>
        )}
        {booking.readinessStatus ? (
          <ReadinessBadge status={booking.readinessStatus} />
        ) : (
          <VenueBookingStatusBadge status={booking.status} />
        )}
      </div>
      <p className="mt-1 text-sm text-slate-800">{booking.venueName}</p>
      <p className="mt-1 text-sm text-slate-600">{formatPeriod(booking.startsAt, booking.endsAt)}</p>
    </li>
  );
}

function EquipmentRow({ item }: { item: GroupedEquipmentRequirement }) {
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-900">
          {item.equipmentName} × {item.quantity}
        </span>
        <ReadinessBadge status={item.readinessStatus} />
      </div>
    </li>
  );
}

/**
 * AC01/AC02/AC03/AC05: an organiser's read-only view of their Confirmed
 * event's venue (with every booking and its own period), date and time (the
 * Confirmed main venue booking's period), and equipment/technical-support
 * arrangements — confirmed items separated from pending or needs-review
 * ones, with "Not Required" shown instead of an empty equipment list.
 */
export function ConfirmedArrangementsSection({
  event,
  bookings,
  readiness,
}: {
  event: EventDetail;
  bookings: VenueBookingRequestSummary[];
  readiness: EventReadiness;
}) {
  const { confirmed, pendingOrNeedsReview, other } = groupVenueBookingsByReadiness(
    bookings,
    readiness.venues,
  );
  // SPM-46 AC05/AC06: completing an event releases its equipment
  // reservations, which readiness would now read as Pending. Every item had
  // to be reserved for the event to be Confirmed, so on a Completed event
  // they all stay under Confirmed.
  const equipmentGroups =
    event.status === "completed"
      ? {
          confirmed: event.equipment.map((item) => ({
            ...item,
            readinessStatus: "complete" as const,
          })),
          pendingOrNeedsReview: [],
        }
      : groupEquipmentByReadiness(event.equipment, readiness.equipment);
  const equipmentNotRequired =
    event.equipment.length === 0 && readiness.equipmentArrangementStatus === "not_required";

  const confirmedMainVenue = confirmed.find((booking) => booking.isMainVenue);

  return (
    <section
      aria-label="Confirmed arrangements"
      className="mt-4 rounded-2xl border border-slate-200 bg-white p-6"
    >
      <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">
        Confirmed arrangements
      </h2>

      <div className="mt-4">
        <h3 className="text-xs font-semibold text-slate-500 uppercase">Date and time</h3>
        <p className="mt-1 text-sm text-slate-800">
          {confirmedMainVenue
            ? formatPeriod(confirmedMainVenue.startsAt, confirmedMainVenue.endsAt)
            : event.startsAt && event.endsAt
              ? `${formatPeriod(event.startsAt, event.endsAt)} (originally requested)`
              : "Not set"}
        </p>
      </div>

      <div className="mt-6">
        <h3 className="text-xs font-semibold text-slate-500 uppercase">Venue bookings</h3>
        <VenueBookingGroup heading="Confirmed" bookings={confirmed} />
        <VenueBookingGroup heading="Pending / Needs Review" bookings={pendingOrNeedsReview} />
        {other.length > 0 && (
          <div className="mt-4">
            <h4 className="text-xs font-medium text-slate-400">Other</h4>
            <ul className="mt-2 divide-y divide-slate-100 opacity-75">
              {other.map((booking) => (
                <VenueBookingRow key={booking.id} booking={booking} />
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-6">
        <h3 className="text-xs font-semibold text-slate-500 uppercase">
          Equipment and technical support
        </h3>
        {equipmentNotRequired ? (
          <p className="mt-2 text-sm text-slate-500">
            <ReadinessBadge status="not_required" />
          </p>
        ) : (
          <>
            <EquipmentGroup heading="Confirmed" items={equipmentGroups.confirmed} />
            <EquipmentGroup
              heading="Pending / Needs Review"
              items={equipmentGroups.pendingOrNeedsReview}
            />
          </>
        )}
      </div>
    </section>
  );
}

function VenueBookingGroup({
  heading,
  bookings,
}: {
  heading: string;
  bookings: GroupedVenueBooking[];
}) {
  if (bookings.length === 0) return null;
  return (
    <div className="mt-4">
      <h4 className="text-xs font-medium text-slate-500">{heading}</h4>
      <ul className="mt-2 divide-y divide-slate-100">
        {bookings.map((booking) => (
          <VenueBookingRow key={booking.id} booking={booking} />
        ))}
      </ul>
    </div>
  );
}

function EquipmentGroup({
  heading,
  items,
}: {
  heading: string;
  items: GroupedEquipmentRequirement[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-4">
      <h4 className="text-xs font-medium text-slate-500">{heading}</h4>
      <ul className="mt-2 divide-y divide-slate-100">
        {items.map((item) => (
          <EquipmentRow key={item.id} item={item} />
        ))}
      </ul>
    </div>
  );
}
