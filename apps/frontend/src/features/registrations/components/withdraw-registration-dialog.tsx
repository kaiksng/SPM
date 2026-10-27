import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/features/event-requests/components/modal";

/**
 * The reason is optional (unlike a safety-check decision) — nothing is
 * being justified, the attendee is just leaving. Same shell and pattern as
 * SafetyCheckDecisionDialog's optional-reason case.
 */
export function WithdrawRegistrationDialog({
  eventTitle,
  onCancel,
  onSubmit,
}: {
  eventTitle: string;
  onCancel: () => void;
  onSubmit: (reason: string) => Promise<unknown>;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    try {
      await onSubmit(reason.trim());
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "This registration could not be withdrawn.",
      );
      setSubmitting(false);
    }
  }

  return (
    <Modal titleId="withdraw-registration-title" title="Withdraw your registration" onCancel={onCancel}>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <p className="text-sm text-slate-600">
          Your place for &quot;{eventTitle}&quot; will be released to the next person on the
          waiting list. You can register again later if a place is still available.
        </p>
        <div>
          <label htmlFor="withdraw-registration-reason" className="text-sm font-medium text-slate-700">
            Reason <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            id="withdraw-registration-reason"
            rows={3}
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
            Withdraw
          </Button>
        </div>
      </form>
    </Modal>
  );
}
