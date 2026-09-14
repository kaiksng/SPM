import {
  clarificationPermittedFieldKeys,
  clarificationPermittedFieldLabels,
  isUnresolvedClarificationStatus,
  type ClarificationPermittedField,
} from "@spm/shared";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  listClarifications,
  requestClarification,
  type ClarificationSummary,
} from "@/features/event-requests/services/clarifications";
import { decideEvent } from "@/features/event-requests/services/decisions";

const dateFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * Clarification is only meaningful before a decision is made, and today
 * "Requested" is the only pre-decision status a request can sit in (see
 * docs/requirements — the review/decision statuses are a later slice), so
 * this renders nothing outside it.
 */
export function ClarificationPanel({
  eventId,
  eventStatus,
  role,
  onReviewStateChange,
  onDecided,
  className = "mt-3 border-t border-slate-100 pt-3 text-sm",
}: {
  eventId: string;
  eventStatus: string;
  role: "organiser" | "coordinator";
  /** Reports the unresolved round's status (or undefined once none is
   * unresolved), so the card header (shared by both the organiser's and
   * coordinator's view of this same event) can show a matching badge next to
   * the status pill, without fetching the clarification list a second time. */
  onReviewStateChange?: (state: "open" | "answered" | undefined) => void;
  /** Fires after a successful Approve/Reject — the event has left
   * "requested" at that point, so the caller (EventDetailPage) navigates
   * away rather than this panel trying to re-render a state it no longer
   * covers. */
  onDecided?: (decision: "approved" | "rejected") => void;
  /** Overrides the wrapper's styling — the default suits a card footer;
   * a standalone page (EventDetailPage) passes its own spacing instead. */
  className?: string;
}) {
  const [clarifications, setClarifications] = useState<ClarificationSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string>();
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [showDecisionDialog, setShowDecisionDialog] = useState<"approved" | "rejected">();

  const shouldRender = eventStatus === "requested";

  useEffect(() => {
    if (!shouldRender) return;

    let active = true;
    listClarifications(eventId)
      .then((items) => {
        if (active) setClarifications(items);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "We couldn't load the clarification history.",
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

  // A failed history load never blocks the action below it — worst case, a
  // coordinator sees "Request clarification" when one is already open and
  // gets a clear error back from the RPC, rather than a dead-end panel.
  const unresolved = clarifications.find((c) => isUnresolvedClarificationStatus(c.status));

  useEffect(() => {
    // unresolved is filtered to open/answered only, but its type is the
    // broader ClarificationStatus — narrow it for the callback's signature.
    onReviewStateChange?.(unresolved?.status as "open" | "answered" | undefined);
    // onReviewStateChange intentionally excluded: callers pass an inline
    // setState function, so including it here would refire on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unresolved?.status]);

  if (!shouldRender) return null;
  if (!loaded) return null;

  function handleRequested(created: ClarificationSummary) {
    setClarifications((current) => [...(current ?? []), created]);
    setShowRequestDialog(false);
  }

  async function handleDecide(decision: "approved" | "rejected", rationale: string) {
    await decideEvent(eventId, decision, rationale);
    setShowDecisionDialog(undefined);
    onDecided?.(decision);
  }

  // AC05: a genuinely open (unanswered) round blocks everything else. An
  // answered one no longer blocks — asking again or deciding is itself how
  // the coordinator closes it (AC06), so all three actions stay available.
  const blockedByOpenClarification = unresolved?.status === "open";

  return (
    <div className={className}>
      {error && (
        <p role="alert" className="mb-2 text-xs text-red-700">
          {error}
        </p>
      )}

      {role === "coordinator" && (
        <div>
          {unresolved?.status === "open" && (
            <p className="text-xs text-slate-500">
              Awaiting the organiser's response to: "{unresolved.question}"
            </p>
          )}
          {unresolved?.status === "answered" && (
            <p className="text-xs text-slate-600">Response: {unresolved.response}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={blockedByOpenClarification}
              onClick={() => setShowRequestDialog(true)}
            >
              Request clarification
            </Button>
            <Button
              size="sm"
              disabled={blockedByOpenClarification}
              onClick={() => setShowDecisionDialog("approved")}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={blockedByOpenClarification}
              onClick={() => setShowDecisionDialog("rejected")}
            >
              Reject
            </Button>
          </div>
          {blockedByOpenClarification && (
            <p className="mt-1 text-xs text-slate-400">
              Waiting for the organiser's response before you can decide or ask again.
            </p>
          )}
        </div>
      )}

      {role === "organiser" && unresolved?.status === "open" && (
        <div>
          <p className="text-xs text-slate-600">Coordinator asked: "{unresolved.question}"</p>
          <p className="mt-1 text-xs text-slate-400">
            You may still update: {unresolved.permittedFields
              .map((f) => clarificationPermittedFieldLabels[f as ClarificationPermittedField] ?? f)
              .join(", ") || "nothing else"}
            . Other fields are locked until you respond.
          </p>
          <Link
            to={`/events/${eventId}/edit`}
            className={buttonVariants({ size: "sm", className: "mt-2" })}
          >
            Respond
          </Link>
        </div>
      )}
      {role === "organiser" && unresolved?.status === "answered" && (
        <p className="text-xs text-slate-500">
          Waiting for the coordinator to review your response.
        </p>
      )}

      {clarifications.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-slate-500">
            Clarification history ({clarifications.length})
          </summary>
          <ol className="mt-2 space-y-2">
            {clarifications.map((c) => (
              <li key={c.id} className="text-xs text-slate-500">
                <p>Coordinator requested {dateFormatter.format(new Date(c.requestedAt))}: "{c.question}"</p>
                {c.response && c.respondedAt && (
                  <p>Organiser responded {dateFormatter.format(new Date(c.respondedAt))}: "{c.response}"</p>
                )}
                {c.status === "resolved" && c.resolvedAt && (
                  <p>Coordinator resolved {dateFormatter.format(new Date(c.resolvedAt))}</p>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}

      {showRequestDialog && (
        <RequestClarificationDialog
          onCancel={() => setShowRequestDialog(false)}
          onSubmit={(question, permittedFields) =>
            requestClarification(eventId, question, permittedFields).then((result) =>
              handleRequested({
                id: result.data.id,
                question,
                response: null,
                status: "open",
                permittedFields,
                requestedAt: result.data.requestedAt,
                respondedAt: null,
                resolvedAt: null,
              }),
            )
          }
        />
      )}
      {showDecisionDialog && (
        <DecisionDialog
          decision={showDecisionDialog}
          onCancel={() => setShowDecisionDialog(undefined)}
          onSubmit={(rationale) => handleDecide(showDecisionDialog, rationale)}
        />
      )}
    </div>
  );
}

function Modal({
  titleId,
  title,
  children,
  onCancel,
}: {
  titleId: string;
  title: string;
  children: React.ReactNode;
  onCancel: () => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      >
        <h2 id={titleId} className="text-lg font-semibold text-slate-950">
          {title}
        </h2>
        {children}
        <button ref={closeButton} type="button" className="sr-only" onClick={onCancel}>
          Close
        </button>
      </div>
    </div>
  );
}

function RequestClarificationDialog({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (question: string, permittedFields: ClarificationPermittedField[]) => Promise<unknown>;
}) {
  const [question, setQuestion] = useState("");
  const [permittedFields, setPermittedFields] = useState<ClarificationPermittedField[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  function toggleField(field: ClarificationPermittedField) {
    setPermittedFields((current) =>
      current.includes(field) ? current.filter((f) => f !== field) : [...current, field],
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!question.trim()) {
      setError("Describe what information is needed.");
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      await onSubmit(question.trim(), permittedFields);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "This clarification could not be requested.",
      );
      setSubmitting(false);
    }
  }

  return (
    <Modal titleId="request-clarification-title" title="Request clarification" onCancel={onCancel}>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label htmlFor="clarification-question" className="text-sm font-medium text-slate-700">
            What information is needed?
          </label>
          <textarea
            id="clarification-question"
            rows={3}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus-visible:border-blue-400 focus-visible:ring-3 focus-visible:ring-blue-100"
          />
        </div>
        <fieldset>
          <legend className="text-sm font-medium text-slate-700">
            The organiser may still edit
          </legend>
          <div className="mt-2 grid grid-cols-1 gap-1.5">
            {clarificationPermittedFieldKeys.map((field) => (
              <label key={field} className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={permittedFields.includes(field)}
                  onChange={() => toggleField(field)}
                />
                {clarificationPermittedFieldLabels[field]}
              </label>
            ))}
          </div>
        </fieldset>
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

function DecisionDialog({
  decision,
  onCancel,
  onSubmit,
}: {
  decision: "approved" | "rejected";
  onCancel: () => void;
  onSubmit: (rationale: string) => Promise<unknown>;
}) {
  const [rationale, setRationale] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const isReject = decision === "rejected";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // AC03: only rejection requires a reason — approval may be submitted blank.
    if (isReject && !rationale.trim()) {
      setError("Explain the reason for rejecting this event.");
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      await onSubmit(rationale.trim());
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
      titleId="decision-dialog-title"
      title={isReject ? "Reject event request" : "Approve event request"}
      onCancel={onCancel}
    >
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label htmlFor="decision-rationale" className="text-sm font-medium text-slate-700">
            {isReject ? "Reason for rejecting" : "Notes (optional)"}
          </label>
          <textarea
            id="decision-rationale"
            rows={4}
            value={rationale}
            onChange={(event) => setRationale(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus-visible:border-blue-400 focus-visible:ring-3 focus-visible:ring-blue-100"
          />
        </div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant={isReject ? "destructive" : "default"} disabled={submitting}>
            {isReject ? "Reject event" : "Approve event"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
