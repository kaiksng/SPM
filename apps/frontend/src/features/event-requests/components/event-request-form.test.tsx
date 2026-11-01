import {
  EventSubmissionError,
  emptyEventRequestFormValues,
  eventDraftSchema as eventDraftSchemaForTest,
  eventSubmissionSchema,
  type EventRequestFormValues,
} from "@spm/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { loadEquipmentCatalogue } from "@/features/event-requests/services/equipment";

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
  // SPM-40 AC01: the request only asks whether registration is required; the
  // rules themselves are set once the event reaches Planning.
  it("asks only whether registration is required, even when it is ticked", async () => {
    const user = userEvent.setup();
    render(
      <EventRequestForm
        initialValues={values({ title: "Registration request" })}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByLabelText(/Attendee registration is required/));

    expect(screen.getByLabelText(/Attendee registration is required/)).toBeChecked();
    expect(
      screen.getByText(/You set the registration rules once the event reaches Planning/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Opens/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Closes/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Capacity/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Waiting list|Waitlist/)).not.toBeInTheDocument();
    expect(screen.queryByText(/withdraw/i)).not.toBeInTheDocument();
  });

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
  // SPM-27 AC02: a retired item is not offered for a new requirement, but stays
  // visible on a requirement that already uses it.
  it("does not offer a retired item, except on the row that already uses it", async () => {
    vi.mocked(loadEquipmentCatalogue).mockResolvedValueOnce([
      { id: MICROPHONE_ID, name: "Wireless microphone", category: "Audio", retired: false },
      { id: PROJECTOR_ID, name: "Old projector", category: "Visual", retired: true },
    ]);
    const user = userEvent.setup();
    render(
      <EventRequestForm
        initialValues={values({
          title: "Catalogue",
          equipment: [
            {
              id: "requirement-1",
              equipmentItemId: PROJECTOR_ID,
              legacyName: "",
              quantity: "1",
              requiredFrom: "2099-04-01T08:00",
              requiredUntil: "2099-04-01T14:00",
              notes: "",
            },
          ],
        })}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await screen.findByRole("option", { name: "Old projector (no longer offered)" });
    await user.click(screen.getByRole("button", { name: "Add equipment" }));

    const [existingRow, newRow] = screen.getAllByLabelText(/^Equipment/);
    expect(existingRow).toHaveValue(PROJECTOR_ID);
    expect(newRow!.querySelector(`option[value="${PROJECTOR_ID}"]`)).toBeNull();
    expect(newRow!.querySelector(`option[value="${MICROPHONE_ID}"]`)).not.toBeNull();
  });

  // SPM-27 AC02: equipment comes from the catalogue, grouped by category.
  it("offers only catalogue equipment, grouped by category (SPM-27 AC02)", async () => {
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

  it("identifies every missing mandatory equipment field and does not save (SPM-27 AC03/AC06)", async () => {
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

  it("keeps a legacy free-text entry or replaces it with catalogue equipment", async () => {
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

describe("EventRequestForm submit mode (SPM-3)", () => {
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

// SPM-2: the Draft keeps whatever the organiser filled in; only the event name is mandatory.
describe("EventRequestForm draft fields", () => {
  it("saves a Draft with the purpose, description, location, layout and accessibility the organiser chose", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EventRequestForm initialValues={values({ title: "Open Day" })} onSave={onSave} onCancel={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText(/^Purpose/), "Conference");
    await user.type(screen.getByLabelText(/^Description/), "Annual open day");
    await user.selectOptions(screen.getByLabelText(/^Preferred location/), "Bugis");
    await user.selectOptions(screen.getByLabelText(/^Room layout/), "Theatre");
    await user.type(screen.getByLabelText(/^Accessibility needs/), "Two wheelchair spaces");
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Open Day",
        purpose: "Conference",
        description: "Annual open day",
        venue: expect.objectContaining({
          preferredLocation: "Bugis",
          layoutNotes: "Theatre",
          accessibilityNotes: "Two wheelchair spaces",
        }),
      }),
    );
  });

  // SPM-2 AC: all the latest saved values are displayed when the Draft is reopened.
  it("keeps a saved room layout that is no longer in the standard list", () => {
    render(
      <EventRequestForm
        initialValues={values({ title: "Legacy", venue: { ...emptyEventRequestFormValues.venue, layoutNotes: "U-shape with stage" } })}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/^Room layout/)).toHaveValue("U-shape with stage");
    expect(screen.getByRole("option", { name: "U-shape with stage" })).toBeInTheDocument();
  });

  it("shows the notes of a previously saved equipment entry that is not in the catalogue", () => {
    render(
      <EventRequestForm
        initialValues={values({
          title: "Legacy",
          equipment: [{ id: "legacy-row", equipmentItemId: "", legacyName: "Old projector", quantity: "1", requiredFrom: "", requiredUntil: "", notes: "Rear of hall" }],
        })}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText(/Notes: Rear of hall/)).toBeInTheDocument();
  });

  it("explains when the equipment catalogue cannot be loaded", async () => {
    vi.mocked(loadEquipmentCatalogue).mockRejectedValueOnce(new Error("Catalogue offline"));
    render(<EventRequestForm initialValues={values({ title: "Open Day" })} onSave={vi.fn()} onCancel={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Catalogue offline");
  });
});

describe("EventRequestForm failures and in-progress actions", () => {
  it("uses a plain message when saving or submitting fails without one", async () => {
    const user = userEvent.setup();
    render(
      <EventRequestForm
        initialValues={values({ title: "Open Day" })}
        onSave={vi.fn().mockRejectedValue("boom")}
        onSubmitRequest={vi.fn().mockRejectedValue("boom")}
        submissionSchema={eventDraftSchemaForTest}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText("Your draft could not be saved. Try again.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Submit request" }));
    expect(await screen.findByText("Your event request could not be submitted. Try again.")).toBeInTheDocument();
  });

  it("shows that a submission is in progress and blocks a second click", async () => {
    const user = userEvent.setup();
    let finish: () => void = () => {};
    const onSubmitRequest = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(
      <EventRequestForm
        initialValues={values({ title: "Open Day" })}
        onSave={vi.fn()}
        onSubmitRequest={onSubmitRequest}
        submissionSchema={eventDraftSchemaForTest}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Submit request" }));

    expect(await screen.findByRole("button", { name: "Submitting…" })).toBeDisabled();
    expect(onSubmitRequest).toHaveBeenCalledOnce();
    finish();
    expect(await screen.findByRole("button", { name: "Submit request" })).toBeEnabled();
  });

  it("does nothing when a submit action has no submission rules to check against", async () => {
    const user = userEvent.setup();
    const onSubmitRequest = vi.fn();
    render(
      <EventRequestForm
        initialValues={values({ title: "Open Day" })}
        onSave={vi.fn()}
        onSubmitRequest={onSubmitRequest}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Submit request" }));

    expect(onSubmitRequest).not.toHaveBeenCalled();
  });
});

describe("EventRequestForm with several equipment rows", () => {
  const row = (id: string, itemId: string, quantity: string) => ({
    id,
    equipmentItemId: itemId,
    legacyName: "",
    quantity,
    requiredFrom: "2099-04-01T08:00",
    requiredUntil: "2099-04-01T13:00",
    notes: "",
  });

  // SPM-2 AC: editing one part of a Draft leaves the rest as saved.
  it("changes only the row that was edited", async () => {
    const user = userEvent.setup();
    render(
      <EventRequestForm
        initialValues={values({ title: "Open Day", equipment: [row("r1", MICROPHONE_ID, "1"), row("r2", PROJECTOR_ID, "5")] })}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const quantities = screen.getAllByLabelText(/^Quantity/);
    await user.clear(quantities[0]!);
    await user.type(quantities[0]!, "3");

    expect(screen.getAllByLabelText(/^Quantity/)[0]).toHaveValue(3);
    expect(screen.getAllByLabelText(/^Quantity/)[1]).toHaveValue(5);
  });

  it("replaces only the legacy row that was chosen for replacement", async () => {
    const user = userEvent.setup();
    const legacy = (id: string, name: string) => ({ ...row(id, "", "1"), legacyName: name, requiredFrom: "", requiredUntil: "" });
    render(
      <EventRequestForm
        initialValues={values({ title: "Legacy", equipment: [legacy("l1", "Old projector"), legacy("l2", "Old speaker")] })}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await screen.findAllByRole("option", { name: "Projector" });
    await user.selectOptions(screen.getAllByLabelText("Replace with catalogue equipment")[0]!, PROJECTOR_ID);

    expect(screen.queryByText(/Old projector/)).not.toBeInTheDocument();
    expect(screen.getByText(/Old speaker × 1/)).toBeInTheDocument();
  });
});
