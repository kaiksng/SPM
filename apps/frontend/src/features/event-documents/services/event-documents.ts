import { EVENT_DOCUMENT_TYPES, eventDocumentRejection } from "@spm/shared";

import { supabase } from "@/lib/supabase-client";

const BUCKET = "event-documents";
// A download link is only good for a minute, so it can't be passed around.
const DOWNLOAD_LINK_SECONDS = 60;

export type EventDocument = {
  id: string;
  fileName: string;
  storagePath: string;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: string;
};

function operationError(message: string) {
  return new Error(message);
}

/** The event's attached documents, newest first; removed ones are left out. */
export async function listEventDocuments(eventId: string): Promise<EventDocument[]> {
  const { data, error } = await supabase
    .from("event_documents")
    .select("id, file_name, storage_path, uploaded_by, uploaded_by_name, uploaded_at")
    .eq("event_id", eventId)
    .is("removed_at", null)
    .order("uploaded_at", { ascending: false });

  if (error) throw operationError("The event's documents could not be loaded.");

  return (data ?? []).map((row) => ({
    id: row.id,
    fileName: row.file_name,
    storagePath: row.storage_path,
    uploadedBy: row.uploaded_by,
    uploadedByName: row.uploaded_by_name,
    uploadedAt: row.uploaded_at,
  }));
}

/**
 * Stores the file privately, then records it. The file is screened first so
 * the organiser is told why it is refused; add_event_document and the bucket
 * enforce the same rules. A file that was stored but not recorded is removed.
 */
export async function uploadEventDocument(eventId: string, file: File): Promise<void> {
  const rejection = eventDocumentRejection(file);
  if (rejection) throw operationError(rejection);

  const path = `${eventId}/${crypto.randomUUID()}.${EVENT_DOCUMENT_TYPES[file.type]}`;
  const stored = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  if (stored.error) throw operationError("This file could not be uploaded.");

  const { error } = await supabase.rpc("add_event_document", {
    p_event_id: eventId,
    p_storage_path: path,
    p_file_name: file.name,
    p_content_type: file.type,
    p_size_bytes: file.size,
  });

  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw operationError(error.message || "This file could not be attached.");
  }
}

/**
 * A short-lived private link to download one document. The file name is
 * passed so the download is saved as "Programme.pdf", not the stored id (a
 * browser ignores the link's own download name for a different origin).
 */
export async function getEventDocumentUrl(storagePath: string, fileName: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, DOWNLOAD_LINK_SECONDS, { download: fileName });
  if (error || !data) throw operationError("This document could not be downloaded.");
  return data.signedUrl;
}

/**
 * Records the removal (who and when), then deletes the stored file, trying
 * twice. The removal stands either way (the document leaves the list); if the
 * file still cannot be deleted the organiser is told rather than left unaware.
 */
export async function removeEventDocument(document: EventDocument): Promise<void> {
  const { error } = await supabase.rpc("remove_event_document", { p_document_id: document.id });
  if (error) throw operationError(error.message || "This document could not be removed.");

  let stored = await supabase.storage.from(BUCKET).remove([document.storagePath]);
  if (stored.error) stored = await supabase.storage.from(BUCKET).remove([document.storagePath]);
  if (stored.error) {
    throw operationError("The document was removed, but its file could not be deleted from storage.");
  }
}
