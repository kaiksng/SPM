import { singaporeLocalToIso } from "@spm/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/features/event-requests/components/modal";

/**
 * Venue Staff pauses a Pending request with an expiry instead of deciding
 * right away — place_venue_booking_hold enforces the actual rules (in the
 * future, before the requested period starts); this is just the entry
 * field, same shape as VenueBlocksPage's datetime-local inputs.
 */
export function VenueBookingHoldDialog({
  eventTitle,
  venueName,
  onCancel,
  onSubmit,
}: {
  eventTitle: string;
  venueName: string;
  onCancel: () => void;
  onSubmit: (expiresAtIso: string) => Promise<unknown>;
}) {
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!expiresAt) {
      setError("Enter a date and time for the hold to expire.");
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      await onSubmit(singaporeLocalToIso(expiresAt));
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "This request could not be put on hold.",
      );
      setSubmitting(false);
    }
  }

  return (
    <Modal titleId="venue-hold-dialog-title" title="Place this request on hold" onCancel={onCancel}>
      <p className="mt-1 text-sm text-slate-600">
        {eventTitle} &middot; {venueName}
      </p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label htmlFor="venue-hold-expires" className="text-sm font-medium text-slate-700">
            Expires at
          </label>
          <input
            id="venue-hold-expires"
            type="datetime-local"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <p className="mt-2 text-xs text-slate-500">
            Must be in the future and before the requested period starts. If the coordinator
            hasn&apos;t confirmed by then, this request expires and the venue becomes available
            again.
          </p>
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
          <Button type="submit" disabled={submitting}>
            {submitting ? "Placing hold…" : "Place on hold"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
