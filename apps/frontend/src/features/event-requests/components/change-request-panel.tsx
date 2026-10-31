import { useEffect, useState } from "react";
import { Link } from "react-router";

import { Button, buttonVariants } from "@/components/ui/button";
import { Modal } from "@/features/event-requests/components/modal";
import {
  decideEventChangeRequest,
  listEventChangeRequests,
  submitEventChangeRequest,
  withdrawEventChangeRequest,
  type EventChangeRequestSummary,
} from "@/features/event-requests/services/change-requests";
import { CHANGE_REQUEST_SUBMITTABLE_STATUSES } from "@/features/event-requests/utils/format-change-request";

/**
 * SPM-38: the organiser may request a permitted change while the event is
 * Requested, Planning, Confirmed or Pending Safety Check (AC01) — unlike
 * ClarificationPanel, which only applies to Requested. The assigned
 * coordinator decides it (AC05); when the event has no coordinator yet, only
 * a Requested event can be in that state, so the Coordinator Lead decides
 * instead (AC06) — the caller passes `isEventAssigned` so a Lead viewing an
 * already-assigned event (read-only for everything else) still doesn't see
 * decide actions that aren't theirs to take.
 *
 * SPM-39: approval needs implementation notes, and an Approved request is
 * then applied by the assigned coordinator only (AC07) — a Lead who
 * approved on an unassigned event waits for a coordinator to be assigned.
 */
export function ChangeRequestPanel({
  eventId,
  eventStatus,
  role,
  isEventAssigned,
  className = "mt-3 border-t border-slate-100 pt-3 text-sm",
  compact = false,
}: {
  eventId: string;
  eventStatus: string;
  role: "organiser" | "coordinator" | "lead";
  isEventAssigned: boolean;
  className?: string;
  /** Just the action (and its status line), for the page header's action group. */
  compact?: boolean;
}) {
  const [requests, setRequests] = useState<EventChangeRequestSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string>();
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [showDecisionDialog, setShowDecisionDialog] = useState<"approved" | "rejected">();
  const [withdrawing, setWithdrawing] = useState(false);

  const shouldRender = CHANGE_REQUEST_SUBMITTABLE_STATUSES.has(eventStatus);
  const canDecide = role === "coordinator" || (role === "lead" && !isEventAssigned);

  useEffect(() => {
    if (!shouldRender) return;

    let active = true;
    listEventChangeRequests(eventId)
      .then((items) => {
        if (active) setRequests(items);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "We couldn't load the change request history.",
          );
        }
      })
      .finally(() => {
        if (active) setLoaded(true);
      });

    return () => {
      active = false;
    };
  }, [eventId, shouldRender]);

  if (!shouldRender) return null;
  if (!loaded) return null;

  // AC08: only one request may be open at a time (enforced server-side too).
  const pending = requests.find((r) => r.status === "pending");
  // SPM-39 AC07: approved but not yet applied.
  const awaitingApply = requests.find((r) => r.status === "approved");

  function handleSubmitted(created: EventChangeRequestSummary) {
    setRequests((current) => [...current, created]);
    setShowSubmitDialog(false);
  }

  async function handleWithdraw() {
    if (!pending) return;
    setWithdrawing(true);
    setError(undefined);
    try {
      await withdrawEventChangeRequest(pending.id);
      setRequests((current) =>
        current.map((r) =>
          r.id === pending.id
            ? { ...r, status: "withdrawn" as const, withdrawnAt: new Date().toISOString() }
            : r,
        ),
      );
    } catch (withdrawError) {
      setError(
        withdrawError instanceof Error
          ? withdrawError.message
          : "This change request could not be withdrawn.",
      );
    } finally {
      setWithdrawing(false);
    }
  }

  async function handleDecide(decision: "approved" | "rejected", reviewNotes: string) {
    if (!pending) return;
    await decideEventChangeRequest(pending.id, decision, reviewNotes);
    setRequests((current) =>
      current.map((r) => (r.id === pending.id ? { ...r, status: decision, reviewNotes } : r)),
    );
    setShowDecisionDialog(undefined);
  }

  return (
    <div className={className}>
      {!compact && (
        <h3 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
          Change requests
        </h3>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {error}
        </p>
      )}

      {pending ? (
        <div className="mt-2">
          <p className="text-xs text-slate-600">
            {canDecide
              ? "A change request is awaiting your review — see Change history for details."
              : "Your change request is pending review."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {role === "organiser" && (
              <Button size="sm" variant="outline" disabled={withdrawing} onClick={handleWithdraw}>
                {withdrawing ? "Withdrawing…" : "Withdraw request"}
              </Button>
            )}
            {canDecide && (
              <>
                <Button size="sm" onClick={() => setShowDecisionDialog("approved")}>
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setShowDecisionDialog("rejected")}
                >
                  Reject
                </Button>
              </>
            )}
          </div>
        </div>
      ) : awaitingApply ? (
        <div className="mt-2">
          <p className="text-xs text-slate-600">
            {role === "coordinator"
              ? "An approved change request is waiting for you to apply it."
              : role === "lead"
                ? "Approved — assign a coordinator to apply this change."
                : "Your change request was approved and is waiting to be applied."}
          </p>
          {role === "coordinator" && (
            <Link
              to={`/events/${eventId}/change-requests/${awaitingApply.id}/apply`}
              className={buttonVariants({ size: "sm", className: "mt-2" })}
            >
              Apply change
            </Link>
          )}
        </div>
      ) : (
        role === "organiser" && (
          <Button
            size="sm"
            variant="outline"
            className={compact ? undefined : "mt-2"}
            onClick={() => setShowSubmitDialog(true)}
          >
            Request a change
          </Button>
        )
      )}

      {showSubmitDialog && (
        <SubmitChangeRequestDialog
          onCancel={() => setShowSubmitDialog(false)}
          onSubmit={(description, reason) =>
            submitEventChangeRequest(eventId, { description }, reason).then((result) =>
              handleSubmitted({
                id: result.data.id,
                requestedChanges: { description },
                reason,
                status: "pending",
                reviewNotes: null,
                requestedAt: new Date().toISOString(),
                reviewedAt: null,
                withdrawnAt: null,
                implementedAt: null,
              }),
            )
          }
        />
      )}
      {showDecisionDialog && (
        <ChangeRequestDecisionDialog
          decision={showDecisionDialog}
          onCancel={() => setShowDecisionDialog(undefined)}
          onSubmit={(reviewNotes) => handleDecide(showDecisionDialog, reviewNotes)}
        />
      )}
    </div>
  );
}

function SubmitChangeRequestDialog({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (description: string, reason: string) => Promise<unknown>;
}) {
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!description.trim()) {
      setError("Describe the change you are requesting.");
      return;
    }
    if (!reason.trim()) {
      setError("Explain the reason for this change request.");
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      await onSubmit(description.trim(), reason.trim());
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "This change request could not be submitted.",
      );
      setSubmitting(false);
    }
  }

  return (
    <Modal titleId="submit-change-request-title" title="Request a change" onCancel={onCancel}>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label htmlFor="change-request-description" className="text-sm font-medium text-slate-700">
            What change are you requesting?
          </label>
          <textarea
            id="change-request-description"
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        <div>
          <label htmlFor="change-request-reason" className="text-sm font-medium text-slate-700">
            Reason
          </label>
          <textarea
            id="change-request-reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            Send request
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ChangeRequestDecisionDialog({
  decision,
  onCancel,
  onSubmit,
}: {
  decision: "approved" | "rejected";
  onCancel: () => void;
  onSubmit: (reviewNotes: string) => Promise<unknown>;
}) {
  const [reviewNotes, setReviewNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const isReject = decision === "rejected";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // SPM-39 AC05/AC06: both decisions need notes.
    if (!reviewNotes.trim()) {
      setError(
        isReject
          ? "Explain the reason for rejecting this change request."
          : "Add implementation notes before approving this change request.",
      );
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      await onSubmit(reviewNotes.trim());
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
      titleId="change-request-decision-title"
      title={isReject ? "Reject change request" : "Approve change request"}
      onCancel={onCancel}
    >
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label htmlFor="change-request-review-notes" className="text-sm font-medium text-slate-700">
            {isReject ? "Reason for rejecting" : "Implementation notes"}
          </label>
          <textarea
            id="change-request-review-notes"
            rows={4}
            value={reviewNotes}
            onChange={(event) => setReviewNotes(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
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
