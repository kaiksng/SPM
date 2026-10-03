import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/features/event-requests/components/modal";

/**
 * Confirmation dialog for a coordinator handing an event off to another
 * coordinator — modeled on VenueBookingDecisionDialog. Reassignment is hard
 * to reverse (it immediately moves the event to someone else), so this
 * requires an explicit reason and a destructive-styled confirm action.
 */
export function ReassignEventDialog({
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
      setError("Explain why this event needs to be reassigned.");
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
          : "This event could not be reassigned.",
      );
      setSubmitting(false);
    }
  }

  return (
    <Modal titleId="reassign-event-dialog-title" title="Reassign this event" onCancel={onCancel}>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <p className="text-sm text-slate-600">
          This event will be handed off to the Event Coordinator with the fewest active events.
          You will no longer be able to manage it.
        </p>
        <div>
          <label htmlFor="reassign-event-reason" className="text-sm font-medium text-slate-700">
            Why can't you continue with this event?
          </label>
          <textarea
            id="reassign-event-reason"
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
            Cancel
          </Button>
          <Button type="submit" variant="destructive" disabled={submitting}>
            {submitting ? "Reassigning…" : "Reassign event"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
