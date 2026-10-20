import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/features/event-requests/components/modal";
import type { SafetyCheckDecisionOutcome } from "@/features/safety-check/services/safety-check-decisions";

/**
 * Simplified from DecisionDialog/VenueBookingDecisionDialog: both outcomes
 * here require a reason unconditionally (AC1), unlike the organiser's
 * approve/reject, where only rejection does — so there's no isReject-style
 * branch, just one always-mandatory textarea.
 */
export function SafetyCheckDecisionDialog({
  decision,
  flaggedCount,
  onCancel,
  onSubmit,
}: {
  decision: SafetyCheckDecisionOutcome;
  /** Only meaningful for "changes_requested" — how many items are flagged. */
  flaggedCount: number;
  onCancel: () => void;
  onSubmit: (reason: string) => Promise<unknown>;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const isReject = decision === "rejected";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason.trim()) {
      setError("Explain the reason for this decision.");
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
      titleId="safety-check-decision-title"
      title={isReject ? "Reject safety arrangement" : "Request changes"}
      onCancel={onCancel}
    >
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <p className="text-sm text-slate-600">
          {isReject
            ? "Every venue booking and equipment arrangement on this event will be flagged Needs Review. The event returns to Planning — it is not cancelled."
            : `${flaggedCount} item${flaggedCount === 1 ? "" : "s"} will be flagged Needs Review. The coordinator can rework and resubmit for a new review round.`}
        </p>
        <div>
          <label htmlFor="safety-check-decision-reason" className="text-sm font-medium text-slate-700">
            Reason
          </label>
          <textarea
            id="safety-check-decision-reason"
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
          <Button type="submit" variant={isReject ? "destructive" : "default"} disabled={submitting}>
            {isReject ? "Reject" : "Request changes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
