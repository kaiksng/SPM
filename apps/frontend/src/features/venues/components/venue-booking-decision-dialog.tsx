import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/features/event-requests/components/modal";
import type { VenueBookingDecision } from "@/features/venues/services/venue-bookings";

/**
 * Approve/Reject popup for a Pending venue booking request — modeled on
 * event-requests' DecisionDialog (clarification-panel.tsx). Only rejection
 * requires a reason (AC02); this mirrors decide_venue_booking_request's own
 * rule so the error surfaces immediately rather than after a round trip.
 */
export function VenueBookingDecisionDialog({
  decision,
  onCancel,
  onSubmit,
}: {
  decision: VenueBookingDecision;
  onCancel: () => void;
  onSubmit: (reason: string) => Promise<unknown>;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const isReject = decision === "rejected";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isReject && !reason.trim()) {
      setError("Explain the reason for rejecting this venue booking request.");
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      await onSubmit(reason.trim());
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "This decision could not be submitted.",
      );
      setSubmitting(false);
    }
  }

  return (
    <Modal
      titleId="venue-decision-dialog-title"
      title={isReject ? "Reject venue booking request" : "Approve venue booking request"}
      onCancel={onCancel}
    >
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label htmlFor="venue-decision-reason" className="text-sm font-medium text-slate-700">
            {isReject ? "Reason for rejecting" : "Notes (optional)"}
          </label>
          <textarea
            id="venue-decision-reason"
            rows={4}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus-visible:border-blue-400 focus-visible:ring-3 focus-visible:ring-blue-100"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant={isReject ? "destructive" : "default"} disabled={submitting}>
            {isReject ? "Reject request" : "Approve request"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
