import { canChangeEventDocuments, EVENT_DOCUMENT_TYPES } from "@spm/shared";
import { FileText, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  getEventDocumentUrl,
  listEventDocuments,
  removeEventDocument,
  uploadEventDocument,
  type EventDocument,
} from "@/features/event-documents/services/event-documents";

const dateFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

/**
 * SPM-37: an event's supporting documents (programmes, floor plans). The
 * event's own organiser can attach and remove their files while the event is
 * open; everyone who may see the event's documents can list and download them.
 */
export function EventDocumentsSection({
  eventId,
  status,
  isOwnOrganiser,
  currentUserId,
}: {
  eventId: string;
  status: string;
  isOwnOrganiser: boolean;
  currentUserId?: string;
}) {
  const [documents, setDocuments] = useState<EventDocument[]>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  const canChange = isOwnOrganiser && canChangeEventDocuments(status);

  async function reload() {
    setDocuments(await listEventDocuments(eventId));
  }

  useEffect(() => {
    let active = true;
    listEventDocuments(eventId)
      .then((items) => {
        if (active) setDocuments(items);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setDocuments([]);
          setMessage(loadError instanceof Error ? loadError.message : "The event's documents could not be loaded.");
        }
      });
    return () => {
      active = false;
    };
  }, [eventId]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage(undefined);
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That did not work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    await run(async () => {
      await uploadEventDocument(eventId, file);
      await reload();
    });
  }

  async function handleDownload(document: EventDocument) {
    await run(async () => {
      const link = window.document.createElement("a");
      link.href = await getEventDocumentUrl(document.storagePath, document.fileName);
      link.download = document.fileName;
      link.click();
    });
  }

  async function handleRemove(document: EventDocument) {
    await run(async () => {
      try {
        await removeEventDocument(document);
      } finally {
        // Whatever happened, show what is now on record (the removal itself may
        // have been recorded even if deleting the file was not).
        setConfirmingId(undefined);
        await reload().catch(() => {});
      }
    });
  }

  return (
    <section aria-label="Supporting documents" className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">Supporting documents</h2>
      {canChange && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-3">
          {/* The browser's own file picker is hidden; the button opens it. */}
          <input
            ref={fileInput}
            type="file"
            aria-label="Attach a document"
            aria-hidden="true"
            tabIndex={-1}
            accept={Object.values(EVENT_DOCUMENT_TYPES).map((extension) => `.${extension}`).join(",")}
            disabled={busy}
            onChange={handleFile}
            className="sr-only"
          />
          <Button type="button" disabled={busy} onClick={() => fileInput.current?.click()}>
            <Upload /> {busy ? "Working…" : "Attach a document"}
          </Button>
          <p className="text-xs text-slate-500">PDF, PNG or DOCX, up to 10 MB.</p>
        </div>
      )}
      {message && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {message}
        </p>
      )}
      {documents === undefined ? (
        <p className="mt-4 text-sm text-slate-500">Loading documents…</p>
      ) : documents.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No documents have been attached to this event.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {documents.map((document) => (
            <li key={document.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => handleDownload(document)}
                  disabled={busy}
                  className="flex items-center gap-2 text-left text-sm font-medium text-primary hover:underline"
                >
                  <FileText className="size-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{document.fileName}</span>
                </button>
                <p className="mt-0.5 text-xs text-slate-500">
                  {document.uploadedByName} · {dateFormatter.format(new Date(document.uploadedAt))}
                </p>
              </div>
              {canChange && document.uploadedBy === currentUserId && (
                confirmingId === document.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-600">Remove this document?</span>
                    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setConfirmingId(undefined)}>
                      Keep
                    </Button>
                    <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => handleRemove(document)}>
                      Confirm removal
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Remove ${document.fileName}`}
                    disabled={busy}
                    onClick={() => setConfirmingId(document.id)}
                  >
                    Remove
                  </Button>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
