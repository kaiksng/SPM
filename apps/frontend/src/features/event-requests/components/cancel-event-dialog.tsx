import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/features/event-requests/components/modal";

/**
 * Confirms cancelling the whole event. A reason is always required (SPM-45
 * AC3) — modeled on VenueBookingDecisionDialog's reject path, but reason is
 * mandatory here regardless of decision.
 */
export function CancelEventDialog({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (reason: string) => Promise<unknown>;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason.trim()) {
      setError("Give a reason for cancelling this event.");
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      await onSubmit(reason.trim());
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "This event could not be cancelled.",
      );
      setSubmitting(false);
    }
  }

  return (
    <Modal titleId="cancel-event-dialog-title" title="Cancel event" onCancel={onCancel}>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label htmlFor="cancel-event-reason" className="text-sm font-medium text-slate-700">
            Reason for cancelling
          </label>
          <textarea
            id="cancel-event-reason"
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
            Keep event
          </Button>
          <Button type="submit" variant="destructive" disabled={submitting}>
            {submitting ? "Cancelling…" : "Confirm cancellation"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
