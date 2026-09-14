import {
  clarificationPermittedFieldKeys,
  clarificationPermittedFieldLabels,
  isUnresolvedClarificationStatus,
  type ClarificationPermittedField,
} from "@spm/shared";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  listClarifications,
  requestClarification,
  respondToClarification,
  resolveClarification,
  type ClarificationSummary,
} from "@/features/event-requests/services/clarifications";

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
}: {
  eventId: string;
  eventStatus: string;
  role: "organiser" | "coordinator";
}) {
  const [clarifications, setClarifications] = useState<ClarificationSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string>();
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [showRespondDialog, setShowRespondDialog] = useState(false);

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

  if (!shouldRender) return null;
  if (!loaded) return null;

  // A failed history load never blocks the action below it — worst case, a
  // coordinator sees "Request clarification" when one is already open and
  // gets a clear error back from the RPC, rather than a dead-end panel.
  const unresolved = clarifications.find((c) => isUnresolvedClarificationStatus(c.status));

  function handleRequested(created: ClarificationSummary) {
    setClarifications((current) => [...(current ?? []), created]);
    setShowRequestDialog(false);
  }

  function handleUpdated(updated: Partial<ClarificationSummary> & { id: string }) {
    setClarifications((current) =>
      current?.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)),
    );
    setShowRespondDialog(false);
  }

  return (
    <div className="mt-3 border-t border-slate-100 pt-3 text-sm">
      {error && (
        <p role="alert" className="mb-2 text-xs text-red-700">
          {error}
        </p>
      )}
      {unresolved && (
        <span className="mb-2 inline-block rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
          Awaiting Organiser
        </span>
      )}

      {role === "coordinator" && !unresolved && (
        <Button size="sm" variant="outline" onClick={() => setShowRequestDialog(true)}>
          Request clarification
        </Button>
      )}
      {role === "coordinator" && unresolved?.status === "open" && (
        <p className="text-xs text-slate-500">
          Awaiting the organiser's response to: "{unresolved.question}"
        </p>
      )}
      {role === "coordinator" && unresolved?.status === "answered" && (
        <div>
          <p className="text-xs text-slate-600">Response: {unresolved.response}</p>
          <Button
            size="sm"
            className="mt-2"
            onClick={() =>
              resolveClarification(unresolved.id).then(() =>
                handleUpdated({ id: unresolved.id, status: "resolved" }),
              )
            }
          >
            Resolve clarification
          </Button>
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
          <Button size="sm" className="mt-2" onClick={() => setShowRespondDialog(true)}>
            Respond
          </Button>
        </div>
      )}
      {role === "organiser" && unresolved?.status === "answered" && (
        <p className="text-xs text-slate-500">
          Waiting for the coordinator to close this clarification.
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
      {showRespondDialog && unresolved && (
        <RespondClarificationDialog
          onCancel={() => setShowRespondDialog(false)}
          onSubmit={(response) =>
            respondToClarification(unresolved.id, response).then((result) =>
              handleUpdated({
                id: unresolved.id,
                response,
                status: "answered",
                respondedAt: result.data.respondedAt,
              }),
            )
          }
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

function RespondClarificationDialog({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (response: string) => Promise<unknown>;
}) {
  const [response, setResponse] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!response.trim()) {
      setError("Enter a response before submitting.");
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      await onSubmit(response.trim());
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "This response could not be submitted.",
      );
      setSubmitting(false);
    }
  }

  return (
    <Modal titleId="respond-clarification-title" title="Respond to clarification" onCancel={onCancel}>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label htmlFor="clarification-response" className="text-sm font-medium text-slate-700">
            Your response
          </label>
          <textarea
            id="clarification-response"
            rows={4}
            value={response}
            onChange={(event) => setResponse(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus-visible:border-blue-400 focus-visible:ring-3 focus-visible:ring-blue-100"
          />
          <p className="mt-1 text-xs text-slate-400">
            To change a permitted field, use "Edit request" — this only records your written response.
          </p>
        </div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            Submit response
          </Button>
        </div>
      </form>
    </Modal>
  );
}
