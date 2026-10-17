import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/features/event-requests/components/modal";

/**
 * SPM-85: the coordinator releases one booking, giving a reason. A Pending
 * booking is withdrawn; an Approved (confirmed) one is cancelled. Only that
 * booking is released. Mirrors withdraw_venue_booking_request's own rule (a
 * reason is required) so the message appears without a round trip.
 */
export function VenueBookingCancelDialog({
  mode,
  bookingLabel,
  onCancel,
  onSubmit,
}: {
  mode: "withdraw" | "cancel";
  bookingLabel: string;
  onCancel: () => void;
  onSubmit: (reason: string) => Promise<unknown>;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const isCancel = mode === "cancel";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason.trim()) {
      setError("Give a reason for withdrawing or cancelling this venue booking.");
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      await onSubmit(reason.trim());
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "This booking could not be released.",
      );
      setSubmitting(false);
    }
  }

  return (
    <Modal
      titleId="venue-cancel-dialog-title"
      title={isCancel ? `Cancel confirmed booking: ${bookingLabel}` : `Withdraw request: ${bookingLabel}`}
      onCancel={onCancel}
    >
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <p className="text-sm text-slate-600">
          Only this booking is released. The event&apos;s other venue bookings keep their status, and
          Venue Staff are told.
        </p>
        <div>
          <label htmlFor="venue-cancel-reason" className="text-sm font-medium text-slate-700">
            Reason
          </label>
          <textarea
            id="venue-cancel-reason"
            rows={4}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Keep booking
          </Button>
          <Button type="submit" variant="destructive" disabled={submitting}>
            {isCancel ? "Confirm cancellation" : "Confirm withdrawal"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
