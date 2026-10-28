import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/features/event-requests/components/modal";

/**
 * Confirms marking the event completed (SPM-46). Completed is terminal, so
 * this is a deliberate second step rather than a one-click action — modeled
 * on CancelEventDialog, but with no reason since the story asks for none.
 */
export function CompleteEventDialog({
  eventTitle,
  onCancel,
  onConfirm,
}: {
  eventTitle: string;
  onCancel: () => void;
  onConfirm: () => Promise<unknown>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function handleConfirm() {
    setSubmitting(true);
    setError(undefined);
    try {
      await onConfirm();
    } catch (confirmError) {
      setError(
        confirmError instanceof Error
          ? confirmError.message
          : "This event could not be marked completed.",
      );
      setSubmitting(false);
    }
  }

  return (
    <Modal titleId="complete-event-dialog-title" title="Mark this event completed?" onCancel={onCancel}>
      <div className="mt-4 space-y-4">
        <p className="text-sm leading-6 text-slate-600">
          “{eventTitle}” will be closed. Its records stay visible, but no further changes, bookings
          or registrations can be made, and its equipment reservations are released. This cannot be
          undone.
        </p>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Keep event open
          </Button>
          <Button type="button" disabled={submitting} onClick={handleConfirm}>
            {submitting ? "Marking completed…" : "Confirm completion"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
