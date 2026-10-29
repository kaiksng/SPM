import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock, rpcMock, uploadMock, removeMock, signedUrlMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  uploadMock: vi.fn(),
  removeMock: vi.fn(),
  signedUrlMock: vi.fn(),
}));

vi.mock("@/lib/supabase-client", () => ({
  supabase: {
    from: fromMock,
    rpc: rpcMock,
    storage: { from: () => ({ upload: uploadMock, remove: removeMock, createSignedUrl: signedUrlMock }) },
  },
}));

import { getEventDocumentUrl, listEventDocuments, removeEventDocument, uploadEventDocument } from "./event-documents";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";

function file(name: string, type: string, size = 1000) {
  return new File([new Uint8Array(Math.min(size, 10))], name, { type }) as File & { size: number };
}

function sized(name: string, type: string, size: number) {
  const f = file(name, type);
  Object.defineProperty(f, "size", { value: size });
  return f;
}

beforeEach(() => {
  fromMock.mockReset();
  rpcMock.mockReset().mockResolvedValue({ data: "doc-1", error: null });
  uploadMock.mockReset().mockResolvedValue({ error: null });
  removeMock.mockReset().mockResolvedValue({ error: null });
  signedUrlMock.mockReset().mockResolvedValue({ data: { signedUrl: "https://files.test/signed" }, error: null });
});

describe("listEventDocuments", () => {
  // SPM-37 AC: the list shows the file name, uploader and upload date; removed documents are not listed.
  it("returns the event's documents with who uploaded them and when, newest first, without removed ones", async () => {
    const query = queryBuilder({
      data: [
        { id: "d-2", file_name: "Floor plan.png", storage_path: `${EVENT_ID}/b.png`, uploaded_by: "u-1", uploaded_by_name: "Olivia", uploaded_at: "2026-10-02T02:00:00Z" },
        { id: "d-1", file_name: "Programme.pdf", storage_path: `${EVENT_ID}/a.pdf`, uploaded_by: "u-1", uploaded_by_name: "Olivia", uploaded_at: "2026-10-01T02:00:00Z" },
      ],
      error: null,
    });
    fromMock.mockReturnValue(query);

    await expect(listEventDocuments(EVENT_ID)).resolves.toEqual([
      { id: "d-2", fileName: "Floor plan.png", storagePath: `${EVENT_ID}/b.png`, uploadedBy: "u-1", uploadedByName: "Olivia", uploadedAt: "2026-10-02T02:00:00Z" },
      { id: "d-1", fileName: "Programme.pdf", storagePath: `${EVENT_ID}/a.pdf`, uploadedBy: "u-1", uploadedByName: "Olivia", uploadedAt: "2026-10-01T02:00:00Z" },
    ]);
    expect(fromMock).toHaveBeenCalledWith("event_documents");
    expect(query.eq).toHaveBeenCalledWith("event_id", EVENT_ID);
    expect(query.is).toHaveBeenCalledWith("removed_at", null);
    expect(query.order).toHaveBeenCalledWith("uploaded_at", { ascending: false });
  });

  it("returns an empty list when nothing is attached", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: null }));

    await expect(listEventDocuments(EVENT_ID)).resolves.toEqual([]);
  });

  // SPM-37 AC: a user who may not see the documents gets nothing, not an error detail.
  it("says the documents could not be loaded when the read is refused", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: { code: "42501", message: "denied" } }));

    await expect(listEventDocuments(EVENT_ID)).rejects.toThrow("The event's documents could not be loaded.");
  });
});

describe("uploadEventDocument", () => {
  // SPM-37 AC: an organiser can upload PDF, PNG and DOCX files.
  it.each([
    ["Programme.pdf", "application/pdf", "pdf"],
    ["Plan.png", "image/png", "png"],
    ["Run sheet.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
  ])("stores %s privately under the event, then records it", async (name, type, extension) => {
    const upload = file(name, type);

    await uploadEventDocument(EVENT_ID, upload);

    const path = uploadMock.mock.calls[0]?.[0] as string;
    expect(path).toMatch(new RegExp(`^${EVENT_ID}/[0-9a-f-]{36}\\.${extension}$`));
    expect(uploadMock).toHaveBeenCalledWith(path, upload, { contentType: type });
    expect(rpcMock).toHaveBeenCalledWith("add_event_document", {
      p_event_id: EVENT_ID,
      p_storage_path: path,
      p_file_name: name,
      p_content_type: type,
      p_size_bytes: upload.size,
    });
  });

  // SPM-37 AC: unsupported or oversized files are rejected with a reason, before anything is sent.
  it("rejects an unsupported type with a reason and sends nothing", async () => {
    await expect(uploadEventDocument(EVENT_ID, file("virus.exe", "application/x-msdownload"))).rejects.toThrow(
      "Only PDF, PNG or DOCX files are allowed.",
    );

    expect(uploadMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized file with a reason and sends nothing", async () => {
    await expect(uploadEventDocument(EVENT_ID, sized("big.pdf", "application/pdf", 10 * 1024 * 1024 + 1))).rejects.toThrow(
      "The file must be 10 MB or smaller.",
    );

    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("accepts a file of exactly 10 MB", async () => {
    await expect(uploadEventDocument(EVENT_ID, sized("edge.pdf", "application/pdf", 10 * 1024 * 1024))).resolves.toBeUndefined();
  });

  it("does not record a file that could not be stored", async () => {
    uploadMock.mockResolvedValue({ error: { message: "storage down" } });

    await expect(uploadEventDocument(EVENT_ID, file("a.pdf", "application/pdf"))).rejects.toThrow("This file could not be uploaded.");

    expect(rpcMock).not.toHaveBeenCalled();
  });

  // SPM-37 AC: a refused upload leaves no stored file behind, and the reason reaches the organiser.
  it("removes the stored file and shows the database's reason when recording is refused", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "23514", message: "Documents can no longer be changed on a completed, cancelled or rejected event" } });

    await expect(uploadEventDocument(EVENT_ID, file("a.pdf", "application/pdf"))).rejects.toThrow("Documents can no longer be changed");

    expect(removeMock).toHaveBeenCalledWith([uploadMock.mock.calls[0]?.[0]]);
  });

  it("uses a plain message when recording is refused without one", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "" } });

    await expect(uploadEventDocument(EVENT_ID, file("a.pdf", "application/pdf"))).rejects.toThrow("This file could not be attached.");
  });
});

describe("getEventDocumentUrl", () => {
  // SPM-37 AC: authorised users can download each document.
  it("returns a short-lived private link", async () => {
    await expect(getEventDocumentUrl(`${EVENT_ID}/a.pdf`, "Programme.pdf")).resolves.toBe("https://files.test/signed");

    // The link carries the file's real name, so the download is saved as "Programme.pdf".
    expect(signedUrlMock).toHaveBeenCalledWith(`${EVENT_ID}/a.pdf`, 60, { download: "Programme.pdf" });
  });

  // SPM-37 AC: unauthorised users cannot access the file.
  it("says the document could not be downloaded when the link is refused", async () => {
    signedUrlMock.mockResolvedValue({ data: null, error: { message: "denied" } });
    await expect(getEventDocumentUrl(`${EVENT_ID}/a.pdf`, "a.pdf")).rejects.toThrow("This document could not be downloaded.");

    signedUrlMock.mockResolvedValue({ data: null, error: null });
    await expect(getEventDocumentUrl(`${EVENT_ID}/a.pdf`, "a.pdf")).rejects.toThrow("This document could not be downloaded.");
  });
});

describe("removeEventDocument", () => {
  const doc = { id: "d-1", fileName: "a.pdf", storagePath: `${EVENT_ID}/a.pdf`, uploadedBy: "u-1", uploadedByName: "Olivia", uploadedAt: "2026-10-01T02:00:00Z" };

  // SPM-37 AC: an organiser can remove a document they uploaded; the removal and actor are recorded.
  it("records the removal, then deletes the stored file", async () => {
    await expect(removeEventDocument(doc)).resolves.toBeUndefined();

    expect(rpcMock).toHaveBeenCalledWith("remove_event_document", { p_document_id: "d-1" });
    expect(removeMock).toHaveBeenCalledWith([`${EVENT_ID}/a.pdf`]);
  });

  it("keeps the file and shows the reason when the removal is refused", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "42501", message: "You can only remove a document you attached" } });

    await expect(removeEventDocument(doc)).rejects.toThrow("You can only remove a document you attached");

    expect(removeMock).not.toHaveBeenCalled();
  });

  it("uses a plain message when the removal is refused without one", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "" } });

    await expect(removeEventDocument(doc)).rejects.toThrow("This document could not be removed.");
  });

  it("tries the file delete a second time if the first attempt fails", async () => {
    removeMock.mockResolvedValueOnce({ error: { message: "blip" } }).mockResolvedValueOnce({ error: null });

    await expect(removeEventDocument(doc)).resolves.toBeUndefined();

    expect(removeMock).toHaveBeenCalledTimes(2);
  });

  it("tells the organiser when the file still cannot be deleted, though the removal stands", async () => {
    removeMock.mockResolvedValue({ error: { message: "storage down" } });

    await expect(removeEventDocument(doc)).rejects.toThrow("The document was removed, but its file could not be deleted from storage.");

    expect(removeMock).toHaveBeenCalledTimes(2);
  });
});
