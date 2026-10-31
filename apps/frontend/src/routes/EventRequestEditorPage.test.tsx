import type { EventRequestFormValues } from "@spm/shared";
import { emptyEventRequestFormValues } from "@spm/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadEventDraftMock = vi.fn();
const saveEventDraftMock = vi.fn();
const listClarificationsMock = vi.fn();
const respondToClarificationMock = vi.fn();
const submitEventRequestMock = vi.fn();
const setEventBannerMock = vi.fn();

const authState: { profile: { full_name: string; role: string } | null; user: { id: string } | null } = {
  profile: { full_name: "Olivia Organiser", role: "event_organiser" },
  user: { id: "organiser-1" },
};

vi.mock("@/context/auth-context", () => ({ useAuth: () => authState }));
vi.mock("@/hooks/use-page-title", () => ({ usePageTitle: vi.fn() }));
vi.mock("@/features/event-requests/services/event-drafts", () => ({
  loadEventDraft: (...args: unknown[]) => loadEventDraftMock(...args),
  saveEventDraft: (...args: unknown[]) => saveEventDraftMock(...args),
}));
vi.mock("@/features/event-requests/services/clarifications", () => ({
  listClarifications: (...args: unknown[]) => listClarificationsMock(...args),
  respondToClarification: (...args: unknown[]) => respondToClarificationMock(...args),
}));
vi.mock("@/features/event-requests/services/event-submissions", () => ({
  submitEventRequest: (...args: unknown[]) => submitEventRequestMock(...args),
}));
vi.mock("@/features/event-banners/services/event-banners", () => ({
  setEventBanner: (...args: unknown[]) => setEventBannerMock(...args),
}));
// The banner card has its own tests; this stand-in shows what the page hands
// it and lets a test pick a banner.
vi.mock("@/features/event-banners/components/event-banner-section", () => ({
  EventBannerSection: (props: {
    eventId?: string;
    bannerPath: string | null;
    onChanged: (bannerPath: string | null) => void;
  }) => (
    <div>
      <p>Banner event: {props.eventId ?? "not created yet"}</p>
      <p>Banner: {props.bannerPath ?? "none"}</p>
      <button type="button" onClick={() => props.onChanged("organiser-1/new.png")}>Pick banner</button>
    </div>
  ),
}));
// The form has its own tests; this stand-in exposes what the page hands it and lets a test trigger its actions.
vi.mock("@/features/event-requests/components/event-request-form", () => ({
  EventRequestForm: (props: {
    initialValues: EventRequestFormValues;
    onSave: (values: EventRequestFormValues) => Promise<void>;
    onSubmitRequest?: (values: EventRequestFormValues) => Promise<void>;
    onCancel: () => void;
    validationSchema?: unknown;
    submitLabel?: string;
    footerNote?: string;
    permittedFields?: string[];
  }) => {
    const [failure, setFailure] = useState("");
    const run = async (action: () => Promise<void>) => {
      setFailure("");
      try {
        await action();
      } catch (cause) {
        setFailure(cause instanceof Error ? cause.message : "failed");
      }
    };
    return (
      <div>
        <p>Form title: {props.initialValues.title || "(empty)"}</p>
        <p>Submit label: {props.submitLabel ?? "default"}</p>
        <p>Footer note: {props.footerNote ?? "default"}</p>
        <p>Strict validation: {props.validationSchema ? "yes" : "no"}</p>
        <p>Permitted: {props.permittedFields ? props.permittedFields.join("|") || "none" : "all"}</p>
        <button type="button" onClick={() => run(() => props.onSave({ ...props.initialValues, title: "Edited" }))}>Save</button>
        {props.onSubmitRequest && (
          <button type="button" onClick={() => run(() => props.onSubmitRequest!({ ...props.initialValues, title: "Edited" }))}>
            Submit now
          </button>
        )}
        <button type="button" onClick={props.onCancel}>Cancel form</button>
        {failure && <p role="alert">{failure}</p>}
      </div>
    );
  },
}));

import { EventRequestEditorPage } from "./EventRequestEditorPage";

function EventsDestination() {
  const state = useLocation().state as { notice?: string } | null;
  return <p>Events list. Notice: {state?.notice ?? "none"}</p>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="events" element={<EventsDestination />} />
        <Route path="events/new" element={<EventRequestEditorPage />} />
        <Route path="events/:eventId/edit" element={<EventRequestEditorPage />} />
        <Route path="events/:eventId/submit" element={<EventRequestEditorPage mode="submit" />} />
        <Route path="login" element={<p>Login page</p>} />
        <Route path="*" element={<p>Other page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const savedDraft = {
  values: { ...emptyEventRequestFormValues, title: "Saved draft" },
  status: "draft",
};

beforeEach(() => {
  authState.profile = { full_name: "Olivia Organiser", role: "event_organiser" };
  authState.user = { id: "organiser-1" };
  setEventBannerMock.mockReset().mockResolvedValue(undefined);
  loadEventDraftMock.mockReset().mockResolvedValue(savedDraft);
  saveEventDraftMock.mockReset().mockResolvedValue("event-new");
  listClarificationsMock.mockReset().mockResolvedValue([]);
  respondToClarificationMock.mockReset().mockResolvedValue(undefined);
  submitEventRequestMock.mockReset().mockResolvedValue(undefined);
});

describe("EventRequestEditorPage access", () => {
  // SPM-2 AC: a user who is not the owning Event Organiser cannot open or edit a Draft.
  it("denies a signed-in user who is not an Event Organiser", () => {
    authState.profile = { full_name: "Carl Coordinator", role: "event_coordinator" };
    renderAt("/events/event-1/edit");

    expect(screen.getByText("Access denied")).toBeInTheDocument();
    expect(screen.queryByText(/Form title/)).not.toBeInTheDocument();
    expect(loadEventDraftMock).not.toHaveBeenCalled();
  });

  it("shows nothing protected when nobody is signed in", () => {
    authState.profile = null;
    renderAt("/events/event-1/edit");

    expect(screen.queryByText(/Form title/)).not.toBeInTheDocument();
    expect(loadEventDraftMock).not.toHaveBeenCalled();
  });
});

describe("creating a Draft", () => {
  // SPM-2 AC: a saved request is clearly identified as a Draft and is not submitted for review.
  it("opens an empty form labelled as a Draft that is not submitted for review", () => {
    renderAt("/events/new");

    expect(screen.getByRole("heading", { name: "Create an event request" })).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("Not submitted for review")).toBeInTheDocument();
    expect(screen.getByText(/Start with an event name to save a Draft/)).toBeInTheDocument();
    expect(screen.getByText("Form title: (empty)")).toBeInTheDocument();
    expect(screen.getByText("Strict validation: no")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to event requests/ })).toHaveAttribute("href", "/events");
    expect(loadEventDraftMock).not.toHaveBeenCalled();
  });

  // SPM-2 AC: the organiser can save a Draft and return to their requests.
  it("saves a new Draft and returns to the list with a notice", async () => {
    renderAt("/events/new");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Events list. Notice: Draft saved.")).toBeInTheDocument();
    expect(saveEventDraftMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Edited" }), undefined);
    expect(respondToClarificationMock).not.toHaveBeenCalled();
  });

  it("stays on the form and says why when the Draft cannot be saved", async () => {
    saveEventDraftMock.mockRejectedValue(new Error("Your draft could not be saved. Your form values are still here."));
    renderAt("/events/new");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Your draft could not be saved");
    expect(screen.queryByText(/Events list/)).not.toBeInTheDocument();
  });

  it("returns to the list without saving when the organiser cancels", async () => {
    renderAt("/events/new");

    await userEvent.click(screen.getByRole("button", { name: "Cancel form" }));

    expect(await screen.findByText("Events list. Notice: none")).toBeInTheDocument();
    expect(saveEventDraftMock).not.toHaveBeenCalled();
  });

  // SPM-2 AC: submitting from a brand-new form stores the Draft first, and a retry does not create a second event.
  it("creates the Draft once, then submits it, even if the first submission fails", async () => {
    submitEventRequestMock.mockRejectedValueOnce(new Error("Complete every mandatory field"));
    renderAt("/events/new");

    await userEvent.click(screen.getByRole("button", { name: "Submit now" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Complete every mandatory field");
    await userEvent.click(screen.getByRole("button", { name: "Submit now" }));

    expect(await screen.findByText("Events list. Notice: Event request submitted.")).toBeInTheDocument();
    expect(saveEventDraftMock).toHaveBeenCalledTimes(1);
    expect(submitEventRequestMock).toHaveBeenCalledTimes(2);
    expect(submitEventRequestMock).toHaveBeenLastCalledWith("event-new", expect.objectContaining({ title: "Edited" }));
  });
});

describe("reopening a Draft", () => {
  // SPM-2 AC: the owner can reopen a Draft and all the latest saved values are displayed.
  it("loads the saved Draft into the form", async () => {
    renderAt("/events/event-1/edit");

    expect(await screen.findByText("Form title: Saved draft")).toBeInTheDocument();
    expect(loadEventDraftMock).toHaveBeenCalledWith("event-1");
    expect(screen.getByRole("heading", { name: "Continue your event request" })).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  // SPM-2 AC: the owner can edit a Draft repeatedly; each save updates the same Draft.
  it("updates the same Draft and says it was updated", async () => {
    renderAt("/events/event-1/edit");
    await screen.findByText("Form title: Saved draft");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Events list. Notice: Draft updated.")).toBeInTheDocument();
    expect(saveEventDraftMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Edited" }), "event-1");
  });

  // SPM-2 AC: a user who does not own the Draft sees no protected Draft information.
  it("says the request is unavailable when it cannot be loaded", async () => {
    loadEventDraftMock.mockRejectedValue(new Error("This request is unavailable or you do not have access to it."));
    renderAt("/events/event-1/edit");

    expect(await screen.findByText("Request unavailable")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("This request is unavailable or you do not have access to it.");
    expect(screen.queryByText(/Form title/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to event requests" })).toHaveAttribute("href", "/events");
  });

  it("uses a plain message when loading fails without one", async () => {
    loadEventDraftMock.mockRejectedValue("boom");
    renderAt("/events/event-1/edit");

    expect(await screen.findByRole("alert")).toHaveTextContent("This request could not be loaded.");
  });

  // PB-03 AC07: a Requested event can be reopened for a permitted edit but is not offered for submission again.
  it("offers submission only while the request is still a Draft", async () => {
    loadEventDraftMock.mockResolvedValue({ ...savedDraft, status: "requested" });
    renderAt("/events/event-1/edit");

    await screen.findByText("Form title: Saved draft");
    expect(screen.queryByRole("button", { name: "Submit now" })).not.toBeInTheDocument();
  });

  it("submits a saved Draft without creating another event", async () => {
    renderAt("/events/event-1/edit");
    await screen.findByText("Form title: Saved draft");

    await userEvent.click(screen.getByRole("button", { name: "Submit now" }));

    expect(await screen.findByText("Events list. Notice: Event request submitted.")).toBeInTheDocument();
    expect(saveEventDraftMock).not.toHaveBeenCalled();
    expect(submitEventRequestMock).toHaveBeenCalledWith("event-1", expect.objectContaining({ title: "Edited" }));
  });
});

describe("submitting a request", () => {
  it("shows the submission wording and applies the full validation", async () => {
    renderAt("/events/event-1/submit");

    expect(await screen.findByText("Form title: Saved draft")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Submit your event request" })).toBeInTheDocument();
    expect(screen.getByText("Ready to submit")).toBeInTheDocument();
    expect(screen.getByText("Reviewed by a coordinator once submitted")).toBeInTheDocument();
    expect(screen.getByText("Submit label: Submit request")).toBeInTheDocument();
    expect(screen.getByText("Strict validation: yes")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit now" })).not.toBeInTheDocument();
  });

  it("submits the stored request and returns to the list", async () => {
    renderAt("/events/event-1/submit");
    await screen.findByText("Form title: Saved draft");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Events list. Notice: Event request submitted.")).toBeInTheDocument();
    expect(submitEventRequestMock).toHaveBeenCalledWith("event-1", expect.objectContaining({ title: "Edited" }));
    expect(saveEventDraftMock).not.toHaveBeenCalled();
  });
});

// Event Review and Approval: while a coordinator's clarification is open, only the requested fields can be edited.
describe("an open clarification", () => {
  const open = { id: "clar-1", status: "open", question: "How many will attend?", permittedFields: ["expectedAttendance", "title"] };

  it("shows the coordinator's question and the fields that may be edited", async () => {
    listClarificationsMock.mockResolvedValue([open]);
    renderAt("/events/event-1/edit");

    expect(await screen.findByText(/How many will attend\?/)).toBeInTheDocument();
    expect(screen.getByText(/You may update: Expected attendance, Event name/)).toBeInTheDocument();
    expect(screen.getByText("Permitted: expectedAttendance|title")).toBeInTheDocument();
  });

  // The organiser is answering their coordinator, not saving a draft.
  it("labels the save button Submit clarification, with a matching hint", async () => {
    listClarificationsMock.mockResolvedValue([open]);
    renderAt("/events/event-1/edit");

    expect(await screen.findByText("Submit label: Submit clarification")).toBeInTheDocument();
    expect(
      screen.getByText("Footer note: Saving sends your changes to your coordinator as your clarification response."),
    ).toBeInTheDocument();
  });

  it("labels it Save changes once the clarification is answered", async () => {
    listClarificationsMock.mockResolvedValue([{ ...open, status: "answered" }]);
    renderAt("/events/event-1/edit");

    expect(await screen.findByText("Submit label: Save changes")).toBeInTheDocument();
  });

  it("records the edit as the response and says the clarification was addressed", async () => {
    listClarificationsMock.mockResolvedValue([open]);
    renderAt("/events/event-1/edit");
    await screen.findByText(/How many will attend\?/);

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Events list. Notice: Clarification submitted. Your coordinator has been told."),
    ).toBeInTheDocument();
    expect(respondToClarificationMock).toHaveBeenCalledWith("clar-1", "Edited: Expected attendance, Event name");
  });

  it("uses a general response when the coordinator permitted nothing specific", async () => {
    listClarificationsMock.mockResolvedValue([{ ...open, permittedFields: [] }]);
    renderAt("/events/event-1/edit");
    await screen.findByText(/How many will attend\?/);
    expect(screen.getByText(/You may update: nothing else/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(respondToClarificationMock).toHaveBeenCalledWith("clar-1", "Updated the requested information."));
  });

  it("falls back to the raw field name for a field it has no label for", async () => {
    listClarificationsMock.mockResolvedValue([{ ...open, permittedFields: ["somethingNew"] }]);
    renderAt("/events/event-1/edit");

    expect(await screen.findByText(/You may update: somethingNew/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(respondToClarificationMock).toHaveBeenCalledWith("clar-1", "Edited: somethingNew"));
  });

  it("does not respond again once the organiser has already answered", async () => {
    listClarificationsMock.mockResolvedValue([{ ...open, status: "answered" }]);
    renderAt("/events/event-1/edit");
    await screen.findByText(/How many will attend\?/);

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Events list. Notice: Changes saved.")).toBeInTheDocument();
    expect(respondToClarificationMock).not.toHaveBeenCalled();
  });

  it("ignores a resolved clarification and carries on if clarifications cannot be loaded", async () => {
    listClarificationsMock.mockResolvedValueOnce([{ ...open, status: "resolved" }]);
    const first = renderAt("/events/event-1/edit");
    await screen.findByText("Form title: Saved draft");
    expect(screen.queryByText(/How many will attend\?/)).not.toBeInTheDocument();
    expect(screen.getByText("Permitted: all")).toBeInTheDocument();
    first.unmount();

    listClarificationsMock.mockRejectedValueOnce(new Error("offline"));
    renderAt("/events/event-1/edit");
    expect(await screen.findByText("Form title: Saved draft")).toBeInTheDocument();
    expect(screen.queryByText(/requested clarification/)).not.toBeInTheDocument();
  });
});

// Leaving the page before a slow response arrives must not update a page that is no longer shown.
describe("a response that arrives after the organiser has left the page", () => {
  it("ignores a late Draft and a late clarification list", async () => {
    let resolveDraft: (draft: typeof savedDraft) => void = () => {};
    let resolveClarifications: (items: unknown[]) => void = () => {};
    loadEventDraftMock.mockReturnValue(new Promise((resolve) => { resolveDraft = resolve; }));
    listClarificationsMock.mockReturnValue(new Promise((resolve) => { resolveClarifications = resolve; }));
    const view = renderAt("/events/event-1/edit");

    view.unmount();
    resolveDraft(savedDraft);
    resolveClarifications([{ id: "clar-1", status: "open", question: "Late?", permittedFields: [] }]);

    await waitFor(() => expect(loadEventDraftMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/Form title/)).not.toBeInTheDocument();
  });

  it("ignores a late failure to load the Draft", async () => {
    let rejectDraft: (reason: unknown) => void = () => {};
    loadEventDraftMock.mockReturnValue(new Promise((_, reject) => { rejectDraft = reject; }));
    const view = renderAt("/events/event-1/edit");

    view.unmount();
    rejectDraft(new Error("too late"));

    await waitFor(() => expect(loadEventDraftMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Request unavailable")).not.toBeInTheDocument();
  });
});


// Event banner: an organiser can add one from the start; on a new event it is
// attached when the event is first saved.
describe("the event banner", () => {
  it("offers a banner on a new event and attaches it when the Draft is saved", async () => {
    const user = userEvent.setup();
    renderAt("/events/new");

    expect(screen.getByText("Banner event: not created yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pick banner" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Events list. Notice: Draft saved.")).toBeInTheDocument();
    expect(setEventBannerMock).toHaveBeenCalledWith("event-new", "organiser-1/new.png");
  });

  it("attaches it before submitting a new request directly", async () => {
    const user = userEvent.setup();
    renderAt("/events/new");

    await user.click(screen.getByRole("button", { name: "Pick banner" }));
    await user.click(screen.getByRole("button", { name: "Submit now" }));

    expect(await screen.findByText("Events list. Notice: Event request submitted.")).toBeInTheDocument();
    expect(setEventBannerMock).toHaveBeenCalledWith("event-new", "organiser-1/new.png");
    expect(setEventBannerMock.mock.invocationCallOrder[0]!).toBeLessThan(
      submitEventRequestMock.mock.invocationCallOrder[0]!,
    );
  });

  it("still saves the Draft, and says so, when the banner can't be attached", async () => {
    setEventBannerMock.mockRejectedValue(new Error("The banner could not be saved. Try again."));
    const user = userEvent.setup();
    renderAt("/events/new");

    await user.click(screen.getByRole("button", { name: "Pick banner" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText(
        "Events list. Notice: Draft saved. The banner couldn't be added; add it again from the event page.",
      ),
    ).toBeInTheDocument();
  });

  it("saves a new Draft without a banner when none was picked", async () => {
    const user = userEvent.setup();
    renderAt("/events/new");

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Events list. Notice: Draft saved.")).toBeInTheDocument();
    expect(setEventBannerMock).not.toHaveBeenCalled();
  });

  it("shows a saved Draft's banner, changed on the event straight away", async () => {
    loadEventDraftMock.mockResolvedValue({ ...savedDraft, bannerPath: "organiser-1/saved.png" });
    const user = userEvent.setup();
    renderAt("/events/event-1/edit");

    expect(await screen.findByText("Banner: organiser-1/saved.png")).toBeInTheDocument();
    expect(screen.getByText("Banner event: event-1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Events list. Notice: Draft updated.")).toBeInTheDocument();
    expect(setEventBannerMock).not.toHaveBeenCalled();
  });
});
