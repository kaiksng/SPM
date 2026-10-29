import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listEventDocumentsMock = vi.fn();
const uploadEventDocumentMock = vi.fn();
const getEventDocumentUrlMock = vi.fn();
const removeEventDocumentMock = vi.fn();

vi.mock("@/features/event-documents/services/event-documents", () => ({
  listEventDocuments: (...args: unknown[]) => listEventDocumentsMock(...args),
  uploadEventDocument: (...args: unknown[]) => uploadEventDocumentMock(...args),
  getEventDocumentUrl: (...args: unknown[]) => getEventDocumentUrlMock(...args),
  removeEventDocument: (...args: unknown[]) => removeEventDocumentMock(...args),
}));

import { EventDocumentsSection } from "./event-documents-section";

const doc = (id: string, fileName: string, uploadedBy = "organiser-1") => ({
  id, fileName, storagePath: `event-1/${id}.pdf`, uploadedBy, uploadedByName: "Olivia Organiser", uploadedAt: "2099-04-01T02:00:00.000Z",
});

const dateFormat = new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" });

function renderSection(props: Partial<React.ComponentProps<typeof EventDocumentsSection>> = {}) {
  return render(
    <EventDocumentsSection eventId="event-1" status="planning" isOwnOrganiser currentUserId="organiser-1" {...props} />,
  );
}

beforeEach(() => {
  listEventDocumentsMock.mockReset().mockResolvedValue([doc("d-1", "Programme.pdf")]);
  uploadEventDocumentMock.mockReset().mockResolvedValue(undefined);
  getEventDocumentUrlMock.mockReset().mockResolvedValue("https://files.test/signed");
  removeEventDocumentMock.mockReset().mockResolvedValue(undefined);
});

describe("EventDocumentsSection list", () => {
  // SPM-37 AC: authorised users see each document's file name, uploader and upload date.
  it("shows each document with its uploader and date", async () => {
    renderSection({ isOwnOrganiser: false });

    expect(await screen.findByRole("button", { name: "Programme.pdf" })).toBeInTheDocument();
    expect(screen.getByText(`Olivia Organiser · ${dateFormat.format(new Date("2099-04-01T02:00:00.000Z"))}`)).toBeInTheDocument();
    expect(listEventDocumentsMock).toHaveBeenCalledWith("event-1");
  });

  it("shows that documents are loading, then that none are attached", async () => {
    listEventDocumentsMock.mockResolvedValue([]);
    renderSection();

    expect(screen.getByText("Loading documents…")).toBeInTheDocument();
    expect(await screen.findByText("No documents have been attached to this event.")).toBeInTheDocument();
  });

  it("says why the documents could not be loaded, with a plain message when none is given", async () => {
    listEventDocumentsMock.mockRejectedValueOnce(new Error("The event's documents could not be loaded."));
    const failed = renderSection();
    expect(await screen.findByRole("alert")).toHaveTextContent("The event's documents could not be loaded.");
    failed.unmount();

    listEventDocumentsMock.mockRejectedValueOnce("boom");
    renderSection();
    expect(await screen.findByRole("alert")).toHaveTextContent("The event's documents could not be loaded.");
  });

  it("ignores a list that arrives after the page was left", async () => {
    let resolveList: (items: unknown[]) => void = () => {};
    listEventDocumentsMock.mockReturnValueOnce(new Promise((resolve) => { resolveList = resolve; }));
    const first = renderSection();
    first.unmount();
    resolveList([doc("d-1", "Late.pdf")]);

    let rejectList: (reason: unknown) => void = () => {};
    listEventDocumentsMock.mockReturnValueOnce(new Promise((_, reject) => { rejectList = reject; }));
    const second = renderSection();
    second.unmount();
    rejectList(new Error("too late"));

    await waitFor(() => expect(listEventDocumentsMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Late.pdf")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("EventDocumentsSection uploading", () => {
  const pdf = () => new File(["x"], "Plan.pdf", { type: "application/pdf" });

  // SPM-37 AC: an authorised organiser can upload; nobody else is offered the control.
  it("offers the upload only to the event's own organiser while the event is open", async () => {
    renderSection();
    expect(await screen.findByLabelText("Attach a document")).toBeInTheDocument();
    expect(screen.getByText("PDF, PNG or DOCX, up to 10 MB.")).toBeInTheDocument();
  });

  it.each([
    ["someone who is not the organiser", { isOwnOrganiser: false }],
    ["an event that is Completed", { status: "completed" }],
    ["an event that is Cancelled", { status: "cancelled" }],
    ["an event that is Rejected", { status: "rejected" }],
  ])("does not offer the upload for %s", async (_label, props) => {
    renderSection(props);

    await screen.findByRole("button", { name: "Programme.pdf" });
    expect(screen.queryByLabelText("Attach a document")).not.toBeInTheDocument();
  });

  // SPM-37: the way to attach a file is a clear button, not a bare file picker.
  it("offers a clear Attach a document button that opens the file chooser", async () => {
    const open = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    renderSection();

    await userEvent.click(await screen.findByRole("button", { name: "Attach a document" }));

    expect(open).toHaveBeenCalled();
    open.mockRestore();
  });

  it("shows that work is in progress and blocks a second attach while a file is being sent", async () => {
    let finish: () => void = () => {};
    uploadEventDocumentMock.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    renderSection();

    await userEvent.upload(await screen.findByLabelText("Attach a document"), pdf());

    expect(await screen.findByRole("button", { name: "Working…" })).toBeDisabled();
    finish();
    expect(await screen.findByRole("button", { name: "Attach a document" })).toBeEnabled();
  });

  it("uploads the chosen file and shows the refreshed list", async () => {
    listEventDocumentsMock.mockResolvedValueOnce([]).mockResolvedValue([doc("d-2", "Plan.pdf")]);
    renderSection();
    const input = await screen.findByLabelText("Attach a document");

    await userEvent.upload(input, pdf());

    await waitFor(() => expect(uploadEventDocumentMock).toHaveBeenCalledWith("event-1", expect.objectContaining({ name: "Plan.pdf" })));
    expect(await screen.findByRole("button", { name: "Plan.pdf" })).toBeInTheDocument();
  });

  // SPM-37 AC: a rejected file is explained.
  it("shows why a file was refused and keeps the list unchanged", async () => {
    uploadEventDocumentMock.mockRejectedValue(new Error("Only PDF, PNG or DOCX files are allowed."));
    renderSection();

    await userEvent.upload(await screen.findByLabelText("Attach a document"), pdf());

    expect(await screen.findByRole("alert")).toHaveTextContent("Only PDF, PNG or DOCX files are allowed.");
    expect(listEventDocumentsMock).toHaveBeenCalledTimes(1);
  });

  it("uses a plain message when an upload fails without one", async () => {
    uploadEventDocumentMock.mockRejectedValue("boom");
    renderSection();

    await userEvent.upload(await screen.findByLabelText("Attach a document"), pdf());

    expect(await screen.findByRole("alert")).toHaveTextContent("That did not work. Try again.");
  });

  it("does nothing when no file is chosen", async () => {
    renderSection();
    const input = await screen.findByLabelText("Attach a document");

    fireEvent.change(input, { target: { files: [] } });

    expect(uploadEventDocumentMock).not.toHaveBeenCalled();
  });
});

describe("EventDocumentsSection downloading", () => {
  // SPM-37 AC: authorised users can download each document.
  it("downloads a document through its private link", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderSection({ isOwnOrganiser: false });

    await userEvent.click(await screen.findByRole("button", { name: "Programme.pdf" }));

    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(getEventDocumentUrlMock).toHaveBeenCalledWith("event-1/d-1.pdf", "Programme.pdf");
    click.mockRestore();
  });

  it("says when the document could not be downloaded", async () => {
    getEventDocumentUrlMock.mockRejectedValue(new Error("This document could not be downloaded."));
    renderSection({ isOwnOrganiser: false });

    await userEvent.click(await screen.findByRole("button", { name: "Programme.pdf" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This document could not be downloaded.");
  });
});

describe("EventDocumentsSection removing", () => {
  // SPM-37 AC: an organiser can remove a document they uploaded.
  it("removes a document after the organiser confirms", async () => {
    listEventDocumentsMock.mockResolvedValueOnce([doc("d-1", "Programme.pdf")]).mockResolvedValue([]);
    renderSection();

    await userEvent.click(await screen.findByRole("button", { name: "Remove Programme.pdf" }));
    expect(screen.getByText("Remove this document?")).toBeInTheDocument();
    expect(removeEventDocumentMock).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Confirm removal" }));

    await waitFor(() => expect(removeEventDocumentMock).toHaveBeenCalledWith(expect.objectContaining({ id: "d-1" })));
    expect(await screen.findByText("No documents have been attached to this event.")).toBeInTheDocument();
  });

  it("keeps the document when the organiser changes their mind", async () => {
    renderSection();

    await userEvent.click(await screen.findByRole("button", { name: "Remove Programme.pdf" }));
    await userEvent.click(screen.getByRole("button", { name: "Keep" }));

    expect(screen.queryByText("Remove this document?")).not.toBeInTheDocument();
    expect(removeEventDocumentMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Programme.pdf" })).toBeInTheDocument();
  });

  it("refreshes the list and says so when the removal was recorded but the file could not be deleted", async () => {
    removeEventDocumentMock.mockRejectedValue(new Error("The document was removed, but its file could not be deleted from storage."));
    listEventDocumentsMock.mockResolvedValueOnce([doc("d-1", "Programme.pdf")]).mockResolvedValue([]);
    renderSection();

    await userEvent.click(await screen.findByRole("button", { name: "Remove Programme.pdf" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm removal" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("its file could not be deleted from storage");
    expect(await screen.findByText("No documents have been attached to this event.")).toBeInTheDocument();
  });

  it("still shows the failure when the list cannot be refreshed afterwards", async () => {
    removeEventDocumentMock.mockRejectedValue(new Error("You can only remove a document you attached"));
    listEventDocumentsMock.mockResolvedValueOnce([doc("d-1", "Programme.pdf")]).mockRejectedValue(new Error("offline"));
    renderSection();

    await userEvent.click(await screen.findByRole("button", { name: "Remove Programme.pdf" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm removal" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("You can only remove a document you attached");
  });

  it("shows why a document could not be removed", async () => {
    removeEventDocumentMock.mockRejectedValue(new Error("You can only remove a document you attached"));
    renderSection();

    await userEvent.click(await screen.findByRole("button", { name: "Remove Programme.pdf" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm removal" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("You can only remove a document you attached");
  });

  // SPM-37 AC: only the person who uploaded a document can remove it, and only while the event is open.
  it("offers Remove only on the organiser's own documents, and not once the event is finished", async () => {
    listEventDocumentsMock.mockResolvedValue([doc("d-1", "Mine.pdf"), doc("d-2", "Theirs.pdf", "someone-else")]);
    const open = renderSection();

    await screen.findByRole("button", { name: "Theirs.pdf" });
    expect(screen.getByRole("button", { name: "Remove Mine.pdf" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Theirs.pdf" })).not.toBeInTheDocument();
    open.unmount();

    renderSection({ status: "completed" });
    await screen.findByRole("button", { name: "Mine.pdf" });
    expect(within(screen.getByRole("region", { name: "Supporting documents" })).queryByRole("button", { name: /^Remove/ })).not.toBeInTheDocument();
  });
});
