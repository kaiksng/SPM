import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/features/event-requests/components/modal";
import type { SafetyCheckDecisionOutcome } from "@/features/safety-check/services/safety-check-decisions";

const COPY: Record<
  SafetyCheckDecisionOutcome,
  { title: string; body: (flaggedCount: number) => string; reasonLabel: string; reasonRequired: boolean; submitLabel: string }
> = {
  approved: {
    title: "Approve safety arrangement",
    body: () =>
      "This event moves straight to Confirmed. Nothing is flagged. The coordinator and organiser are both notified.",
    reasonLabel: "Note (optional)",
    reasonRequired: false,
    submitLabel: "Approve",
  },
  changes_requested: {
    title: "Request changes",
    body: (flaggedCount) =>
      `${flaggedCount} item${flaggedCount === 1 ? "" : "s"} will be flagged Needs Review. The coordinator can rework and resubmit for a new review round.`,
    reasonLabel: "Reason",
    reasonRequired: true,
    submitLabel: "Request changes",
  },
  rejected: {
    title: "Reject safety arrangement",
    body: () =>
      "Every venue booking and equipment arrangement on this event will be flagged Needs Review. The event returns to Planning — it is not cancelled.",
    reasonLabel: "Reason",
    reasonRequired: true,
    submitLabel: "Reject",
  },
};

/**
 * Simplified from DecisionDialog/VenueBookingDecisionDialog: a reason is
 * mandatory for Request Changes/Reject (AC1) but optional for Approve —
 * there's nothing to justify when everything checks out — so validation
 * and copy are driven by the COPY table above rather than an isReject-style
 * binary branch.
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
  const copy = COPY[decision];

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (copy.reasonRequired && !reason.trim()) {
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
    <Modal titleId="safety-check-decision-title" title={copy.title} onCancel={onCancel}>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <p className="text-sm text-slate-600">{copy.body(flaggedCount)}</p>
        <div>
          <label htmlFor="safety-check-decision-reason" className="text-sm font-medium text-slate-700">
            {copy.reasonLabel}
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
          <Button
            type="submit"
            variant={decision === "rejected" ? "destructive" : "default"}
            className={decision === "approved" ? "bg-emerald-600 text-white hover:bg-emerald-700" : undefined}
            disabled={submitting}
          >
            {copy.submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
