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

const MICROPHONE_ID = "a0000000-0000-0000-0000-000000000001";
const PROJECTOR_ID = "a0000000-0000-0000-0000-000000000002";

vi.mock("@/features/event-requests/services/equipment", () => ({
  loadEquipmentCatalogue: vi.fn().mockResolvedValue([
    { id: "a0000000-0000-0000-0000-000000000001", name: "Wireless microphone", category: "Audio" },
    { id: "a0000000-0000-0000-0000-000000000002", name: "Projector", category: "Visual" },
  ]),
}));

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
  it("shows only the simple Week 4 Release 1 fields", () => {
    render(
      <EventRequestForm
        initialValues={values({ title: "Simple request" })}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText("Event category")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Minimum capacity")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Registration opens")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Registration closes")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Registration capacity")).not.toBeInTheDocument();

    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.getByLabelText(/Preferred location/)).toBeInTheDocument();
    expect(screen.getByLabelText("Room layout")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Required facilities" })).toBeInTheDocument();
    expect(screen.getByLabelText("Accessibility needs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add equipment" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Attendee registration is required/)).toBeInTheDocument();
  });

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

  it("keeps previously saved free-text choices available when a draft reopens", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <EventRequestForm
        initialValues={values({
          title: "Legacy draft",
          purpose: "Welcome new students",
          venue: { ...emptyEventRequestFormValues.venue, preferredLocation: "Old Campus", facilities: ["Projector"] },
        })}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/^Purpose/)).toHaveValue("Welcome new students");
    expect(screen.getByLabelText(/^Preferred location/)).toHaveValue("Old Campus");
    await user.click(screen.getByText("Select facilities (1 selected)"));
    expect(screen.getByRole("checkbox", { name: "Projector (previously saved)" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      purpose: "Welcome new students",
      venue: expect.objectContaining({ preferredLocation: "Old Campus", facilities: ["Projector"] }),
    })));
  });

  it("offers save and submit actions while drafting and validates each action separately", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onSubmitRequest = vi.fn().mockResolvedValue(undefined);
    render(
      <EventRequestForm
        initialValues={values({ title: "Incomplete request" })}
        onSave={onSave}
        onSubmitRequest={onSubmitRequest}
        onCancel={vi.fn()}
        submissionSchema={eventSubmissionSchema}
      />,
    );

    expect(screen.getByRole("button", { name: "Save draft" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Submit request" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Submit request" }));

    expect(
      await screen.findByText("Describe the purpose of the event before submitting"),
    ).toBeInTheDocument();
    expect(onSubmitRequest).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
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

    await user.type(screen.getByLabelText(/Expected attendance/), "1.5");
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

    await user.type(screen.getByLabelText(/Starts/), "2026-09-25T10:00");
    await user.type(screen.getByLabelText(/Ends/), "2026-09-25T10:00");
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

  it("allows several amenities to be selected", async () => {
    const user = userEvent.setup();
    render(
      <EventRequestForm
        initialValues={values({ title: "Facilities draft" })}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByText("Select facilities (0 selected)"));
    await user.click(screen.getByRole("checkbox", { name: "Pantry" }));
    await user.click(screen.getByRole("checkbox", { name: "Parking" }));
    expect(screen.getByRole("checkbox", { name: "Pantry" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Parking" })).toBeChecked();
  });

  it("saves the selected amenities", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <EventRequestForm
        initialValues={values({ title: "Facilities draft" })}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByText("Select facilities (0 selected)"));
    await user.click(screen.getByRole("checkbox", { name: "Pantry" }));
    await user.click(screen.getByRole("checkbox", { name: "Parking" }));
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        venue: expect.objectContaining({ facilities: ["Pantry", "Parking"] }),
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
    await screen.findByRole("option", { name: "Wireless microphone" });
    await user.selectOptions(screen.getByLabelText(/^Equipment/), MICROPHONE_ID);
    expect(screen.getByLabelText(/^Equipment/)).toHaveValue(MICROPHONE_ID);

    await user.click(
      screen.getByRole("button", { name: "Remove equipment item 1" }),
    );
    expect(screen.queryByLabelText(/^Equipment/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Event name/)).toHaveValue("Equipment draft");
  });
});

describe("EventRequestForm equipment requirements", () => {
  it("offers only catalogue equipment, grouped by category (AC02)", async () => {
    const user = userEvent.setup();
    render(
      <EventRequestForm initialValues={values({ title: "Catalogue" })} onSave={vi.fn()} onCancel={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Add equipment" }));
    await screen.findByRole("option", { name: "Wireless microphone" });

    const select = screen.getByLabelText(/^Equipment/);
    expect(select.tagName).toBe("SELECT");
    expect(select.querySelector('optgroup[label="Audio"]')).toHaveTextContent("Wireless microphone");
    expect(select.querySelector('optgroup[label="Visual"]')).toHaveTextContent("Projector");
  });

  it("starts a new row's required period from the event schedule", async () => {
    const user = userEvent.setup();
    render(
      <EventRequestForm
        initialValues={values({
          title: "Scheduled",
          startsAt: "2099-04-01T10:00",
          endsAt: "2099-04-01T12:00",
        })}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add equipment" }));
    expect(screen.getByLabelText(/^Required from/)).toHaveValue("2099-04-01T10:00");
    expect(screen.getByLabelText(/^Required until/)).toHaveValue("2099-04-01T12:00");
  });

  it("identifies every missing mandatory equipment field and does not save (AC06)", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <EventRequestForm initialValues={values({ title: "Incomplete" })} onSave={onSave} onCancel={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Add equipment" }));
    await user.clear(screen.getByLabelText(/^Quantity/));
    await user.click(screen.getByRole("button", { name: /Save draft/ }));

    expect(onSave).not.toHaveBeenCalled();
    expect(await screen.findByText("Choose equipment from the catalogue")).toBeInTheDocument();
    expect(screen.getByText("Enter a quantity")).toBeInTheDocument();
    expect(screen.getByText("Enter when it is required from")).toBeInTheDocument();
    expect(screen.getByText("Enter when it is required until")).toBeInTheDocument();
  });

  it("saves a complete catalogue requirement", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <EventRequestForm initialValues={values({ title: "Complete" })} onSave={onSave} onCancel={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Add equipment" }));
    await screen.findByRole("option", { name: "Wireless microphone" });
    await user.selectOptions(screen.getByLabelText(/^Equipment/), MICROPHONE_ID);
    await user.clear(screen.getByLabelText(/^Quantity/));
    await user.type(screen.getByLabelText(/^Quantity/), "3");
    await user.type(screen.getByLabelText(/^Required from/), "2099-04-01T08:00");
    await user.type(screen.getByLabelText(/^Required until/), "2099-04-01T14:00");
    await user.type(screen.getByLabelText("Technical requirements"), "XLR to the mixer");
    await user.click(screen.getByRole("button", { name: /Save draft/ }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          equipment: [
            expect.objectContaining({
              equipmentItemId: MICROPHONE_ID,
              quantity: "3",
              requiredFrom: "2099-04-01T08:00",
              requiredUntil: "2099-04-01T14:00",
              notes: "XLR to the mixer",
            }),
          ],
        }),
      ),
    );
  });

  it("keeps a legacy free-text entry or replaces it with catalogue equipment (AC13)", async () => {
    const user = userEvent.setup();
    render(
      <EventRequestForm
        initialValues={values({
          title: "Legacy",
          startsAt: "2099-04-01T10:00",
          endsAt: "2099-04-01T12:00",
          equipment: [
            {
              id: "legacy-row",
              equipmentItemId: "",
              legacyName: "Old projector",
              quantity: "1",
              requiredFrom: "",
              requiredUntil: "",
              notes: "",
            },
          ],
        })}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText(/Old projector × 1/)).toBeInTheDocument();
    expect(screen.getByText(/not in the equipment catalogue/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Quantity/)).not.toBeInTheDocument();

    await screen.findByRole("option", { name: "Projector" });
    await user.selectOptions(screen.getByLabelText("Replace with catalogue equipment"), PROJECTOR_ID);

    expect(screen.queryByText(/Old projector/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Equipment/)).toHaveValue(PROJECTOR_ID);
    expect(screen.getByLabelText(/^Required from/)).toHaveValue("2099-04-01T10:00");
  });

  it("locks equipment rows while a clarification does not permit equipment", async () => {
    render(
      <EventRequestForm
        initialValues={values({
          title: "Locked equipment",
          equipment: [
            {
              id: "row-1",
              equipmentItemId: MICROPHONE_ID,
              legacyName: "",
              quantity: "2",
              requiredFrom: "2099-04-01T08:00",
              requiredUntil: "2099-04-01T14:00",
              notes: "",
            },
          ],
        })}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        permittedFields={["venue"]}
      />,
    );

    expect(screen.getByLabelText(/^Equipment/)).toBeDisabled();
    expect(screen.getByLabelText(/^Required from/)).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add equipment" })).toBeDisabled();
  });
});

describe("EventRequestForm with an open clarification", () => {
  const requirementValues = () =>
    values({
      title: "Locked draft",
      venue: {
        ...emptyEventRequestFormValues.venue,
        preferredLocation: "City centre",
      },
      registration: {
        ...emptyEventRequestFormValues.registration,
        required: true,
      },
    });

  it("disables only the fields not in permittedFields", () => {
    render(
      <EventRequestForm
        initialValues={requirementValues()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        permittedFields={["purpose"]}
      />,
    );

    expect(screen.getByLabelText(/Event name/)).toBeDisabled();
    expect(screen.getByLabelText(/Purpose/)).toBeEnabled();
    expect(screen.getByLabelText(/Description/)).toBeDisabled();
    expect(screen.getByLabelText(/Expected attendance/)).toBeDisabled();
    expect(screen.getByLabelText(/Starts/)).toBeDisabled();
    expect(screen.getByLabelText(/Ends/)).toBeDisabled();
  });

  it("locks venue, equipment and registration by default", () => {
    render(
      <EventRequestForm
        initialValues={requirementValues()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        permittedFields={["purpose"]}
      />,
    );

    expect(screen.getByLabelText(/Preferred location/)).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add equipment" })).toBeDisabled();
    expect(screen.getByLabelText(/Attendee registration is required/)).toBeDisabled();
  });

  it("unlocks only the granular bucket that was permitted", () => {
    render(
      <EventRequestForm
        initialValues={requirementValues()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        permittedFields={["registration"]}
      />,
    );

    expect(screen.getByLabelText(/Attendee registration is required/)).toBeEnabled();
    expect(screen.getByLabelText(/Preferred location/)).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add equipment" })).toBeDisabled();
    expect(screen.getByLabelText(/Event name/)).toBeDisabled();
  });

  it("unlocks venue, equipment and registration together for a legacy 'requirements' grant", () => {
    render(
      <EventRequestForm
        initialValues={requirementValues()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        permittedFields={["requirements"]}
      />,
    );

    expect(screen.getByLabelText(/Preferred location/)).toBeEnabled();
    expect(screen.getByRole("button", { name: "Add equipment" })).toBeEnabled();
    expect(screen.getByLabelText(/Attendee registration is required/)).toBeEnabled();
    expect(screen.getByLabelText(/Event name/)).toBeDisabled();
  });

  it("leaves every field enabled when no clarification is open", () => {
    render(
      <EventRequestForm
        initialValues={requirementValues()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/Event name/)).toBeEnabled();
    expect(screen.getByLabelText(/Preferred location/)).toBeEnabled();
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
      screen.getByText("Add at least one venue requirement before submitting"),
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
          venue: {
            ...emptyEventRequestFormValues.venue,
            preferredLocation: "City centre",
          },
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
