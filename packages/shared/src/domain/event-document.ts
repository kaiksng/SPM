/**
 * SPM-37: what a supporting document may be. Mirrors the event-documents
 * storage bucket and public.add_event_document (202610300001); the database is
 * the final authority, this lets the form say why a file is refused before
 * sending it.
 */
export const EVENT_DOCUMENT_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export const EVENT_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

/** Why a file cannot be attached, or undefined when it can. */
export function eventDocumentRejection(file: { type: string; size: number }): string | undefined {
  if (!(file.type in EVENT_DOCUMENT_TYPES)) return "Only PDF, PNG or DOCX files are allowed.";
  if (file.size <= 0) return "The file is empty.";
  if (file.size > EVENT_DOCUMENT_MAX_BYTES) return "The file must be 10 MB or smaller.";
  return undefined;
}

/** Events that are finished or refused no longer take or lose documents. */
export function canChangeEventDocuments(status: string): boolean {
  return !["completed", "cancelled", "rejected"].includes(status);
}
