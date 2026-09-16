import {
  EventSubmissionError,
  emptyEventRequestFormValues,
  eventSubmissionSchema,
  type EventRequestFormValues,
} from "@spm/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EventRequestForm } from "./event-request-form";

function values(
  overrides: Partial<EventRequestFormValues> = {},
): EventRequestFormValues {
  return {
    ...emptyEventRequestFormValues,
    venue: { ...emptyEventRequestFormValues.venue },
    registration: { ...emptyEventRequestFormValues.registration },
    equipment: [],
    ...overrides,
  };
}

describe("EventRequestForm draft mode", () => {
  it("saves when only a valid event name is entered", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <EventRequestForm
        initialValues={values()}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText(/Event name/), "ABC");
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ title: "ABC", expectedAttendance: "" }),
    );
  });

  it.each([
    ["ab", "Event name must contain at least 3 characters"],
    ["a".repeat(161), "Event name must contain at most 160 characters"],
  ])("blocks an out-of-bound event name", async (title, expectedError) => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <EventRequestForm
        initialValues={values({ title })}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save draft" }));

    expect(await screen.findByText(expectedError)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("explains invalid entered values beside their fields", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <EventRequestForm
        initialValues={values({ title: "Valid draft" })}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Expected attendance"), "1.5");
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    expect(
      await screen.findByText("Enter a positive whole number"),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("rejects an end time that is not later than the start time", async () => {
    const user = userEvent.setup();
    render(
      <EventRequestForm
        initialValues={values({ title: "Valid draft" })}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Starts"), "2026-09-25T10:00");
    await user.type(screen.getByLabelText("Ends"), "2026-09-25T10:00");
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    expect(
      await screen.findByText("End time must be after the start time"),
    ).toBeInTheDocument();
  });

  it("preserves entered values and shows the save failure", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error("Shared database unavailable"));
    render(
      <EventRequestForm
        initialValues={values()}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    const title = screen.getByLabelText(/Event name/);
    await user.type(title, "Kai Test Preserved");
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    expect(await screen.findByText("Shared database unavailable")).toBeInTheDocument();
    expect(title).toHaveValue("Kai Test Preserved");
  });

  it("lets a comma actually be typed into the required facilities field", async () => {
    const user = userEvent.setup();
    render(
      <EventRequestForm
        initialValues={values({ title: "Facilities draft" })}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const facilities = screen.getByLabelText(/^Required facilities/);
    await user.type(facilities, "Projector,Stage");

    // Regression: re-deriving the displayed value from
    // values.venue.facilities.join(", ") on every keystroke used to erase a
    // trailing comma outright (splitting "Projector," produces
    // ["Projector", ""], and dropping that empty entry snapped the field back
    // to "Projector") and, even once that was fixed, silently inserted a
    // space after every comma the user hadn't typed. The field now shows
    // exactly what was typed — no re-formatting at all while typing.
    expect(facilities).toHaveValue("Projector,Stage");
  });

  it("submits a completed comma-separated facilities list", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <EventRequestForm
        initialValues={values({ title: "Facilities draft" })}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText(/^Required facilities/), "Projector, Stage");
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        venue: expect.objectContaining({ facilities: ["Projector", "Stage"] }),
      }),
    );
  });

  it("adds and removes equipment rows without affecting the draft", async () => {
    const user = userEvent.setup();
    render(
      <EventRequestForm
        initialValues={values({ title: "Equipment draft" })}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add equipment" }));
    await user.type(screen.getByLabelText("Equipment"), "Microphone");
    expect(screen.getByLabelText("Equipment")).toHaveValue("Microphone");

    await user.click(
      screen.getByRole("button", { name: "Remove equipment item 1" }),
    );
    expect(screen.queryByLabelText("Equipment")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Event name/)).toHaveValue("Equipment draft");
  });
});

describe("EventRequestForm with an open clarification", () => {
  it("disables only the fields not in permittedFields", () => {
    render(
      <EventRequestForm
        initialValues={values({ title: "Locked draft" })}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        permittedFields={["purpose"]}
      />,
    );

    expect(screen.getByLabelText(/Event name/)).toBeDisabled();
    expect(screen.getByLabelText("Purpose")).toBeEnabled();
    expect(screen.getByLabelText("Description")).toBeDisabled();
    expect(screen.getByLabelText("Expected attendance")).toBeDisabled();
    expect(screen.getByLabelText("Starts")).toBeDisabled();
    expect(screen.getByLabelText("Ends")).toBeDisabled();
  });

  it("locks venue, equipment and registration by default", () => {
    render(
      <EventRequestForm
        initialValues={values({ title: "Locked draft" })}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        permittedFields={["purpose"]}
      />,
    );

    expect(screen.getByLabelText("Preferred location")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add equipment" })).toBeDisabled();
    expect(
      screen.getByLabelText(/Attendee registration is required/),
    ).toBeDisabled();
  });

  it("unlocks only the granular bucket that was permitted", () => {
    render(
      <EventRequestForm
        initialValues={values({ title: "Locked draft" })}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        permittedFields={["registration"]}
      />,
    );

    expect(
      screen.getByLabelText(/Attendee registration is required/),
    ).toBeEnabled();
    expect(screen.getByLabelText("Preferred location")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add equipment" })).toBeDisabled();
    expect(screen.getByLabelText(/Event name/)).toBeDisabled();
  });

  it("unlocks venue, equipment and registration together for a legacy 'requirements' grant", () => {
    render(
      <EventRequestForm
        initialValues={values({ title: "Locked draft" })}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        permittedFields={["requirements"]}
      />,
    );

    expect(screen.getByLabelText("Preferred location")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Add equipment" })).toBeEnabled();
    expect(
      screen.getByLabelText(/Attendee registration is required/),
    ).toBeEnabled();
    expect(screen.getByLabelText(/Event name/)).toBeDisabled();
  });

  it("leaves every field enabled when no clarification is open", () => {
    render(
      <EventRequestForm
        initialValues={values({ title: "Unlocked draft" })}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/Event name/)).toBeEnabled();
    expect(screen.getByLabelText("Preferred location")).toBeEnabled();
  });
});

describe("EventRequestForm submit mode (PB-03)", () => {
  // AC06: an incomplete request is blocked locally, before the network call.
  it("blocks submission of an incomplete request without calling onSave", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <EventRequestForm
        initialValues={values({ title: "Incomplete request" })}
        onSave={onSave}
        onCancel={vi.fn()}
        validationSchema={eventSubmissionSchema}
        submitLabel="Submit request"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Submit request" }));

    expect(
      await screen.findByText("Describe the purpose of the event before submitting"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Confirm that each optional requirement is provided or not required",
      ),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  // AC06: a rejection from the backend highlights every affected field the
  // same way a local validation failure does, and retains entered values.
  it("highlights every field returned by a rejected submission", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(
      new EventSubmissionError("Check the highlighted fields and try again.", {
        "venue.preferredLocation":
          "Record at least one venue requirement, or state that none is required",
      }),
    );
    render(
      <EventRequestForm
        initialValues={values({
          title: "Complete-looking request",
          purpose: "Welcome new students",
          description: "A briefing for the incoming cohort.",
          expectedAttendance: "120",
          startsAt: "2099-01-01T10:00",
          endsAt: "2099-01-01T12:00",
          requirementsAcknowledged: true,
        })}
        onSave={onSave}
        onCancel={vi.fn()}
        validationSchema={eventSubmissionSchema}
        submitLabel="Submit request"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Submit request" }));

    expect(await screen.findByText("Check the highlighted fields and try again.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Record at least one venue requirement, or state that none is required",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Event name/)).toHaveValue(
      "Complete-looking request",
    );
  });
});
