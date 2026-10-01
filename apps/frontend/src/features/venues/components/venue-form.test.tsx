import {
  emptyVenueFormValues,
  EventSubmissionError,
  type VenueBookingAtRisk,
  type VenueFormValues,
} from "@spm/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VenueForm } from "./venue-form";

const onSave = vi.fn<(values: VenueFormValues) => Promise<void>>();
const onCancel = vi.fn();

function validValues(overrides: Partial<VenueFormValues> = {}): VenueFormValues {
  return {
    name: "Innovation Hall",
    location: "Block A",
    capacity: "120",
    operatingHours: [{ days: ["mon"], opensAt: "09:00", closesAt: "18:00" }],
    facilities: ["Projector", "Stage"],
    layouts: ["Theatre"],
    description: "",
    accessibilityNotes: "",
    ...overrides,
  };
}

function booking(overrides: Partial<VenueBookingAtRisk> = {}): VenueBookingAtRisk {
  return {
    id: "booking-1",
    eventId: "event-1",
    eventTitle: "Leadership Summit",
    expectedAttendance: 150,
    status: "approved",
    ...overrides,
  };
}

function renderForm(props: Partial<Parameters<typeof VenueForm>[0]> = {}) {
  return render(
    <VenueForm
      initialValues={validValues()}
      onSave={onSave}
      onCancel={onCancel}
      submitLabel="Save changes"
      {...props}
    />,
  );
}

const fields = {
  name: () => screen.getByPlaceholderText("e.g. Innovation Hall"),
  location: () => screen.getByPlaceholderText("Building, campus area or address"),
  capacity: () => screen.getByRole("spinbutton"),
  facilities: () => screen.getByPlaceholderText("Stage, projector, writable wall"),
  description: () => screen.getByPlaceholderText("Notes coordinators should know before booking."),
  accessibility: () =>
    screen.getByPlaceholderText("Describe accessibility features, or leave blank if none."),
};

beforeEach(() => {
  onSave.mockReset().mockResolvedValue(undefined);
  onCancel.mockReset();
});

describe("VenueForm", () => {
  it("shows the default submit label and helper text when no label is given", () => {
    render(<VenueForm initialValues={validValues()} onSave={onSave} onCancel={onCancel} />);

    expect(screen.getByRole("button", { name: "Save venue" })).toBeEnabled();
    expect(
      screen.getByText(/Name, location, capacity, facilities, operating hours and room layouts/),
    ).toBeInTheDocument();
  });

  it("pre-fills every field from initialValues (edit mode)", () => {
    renderForm({
      initialValues: validValues({
        description: "Big room",
        accessibilityNotes: "Ramp",
      }),
    });

    expect(fields.name()).toHaveValue("Innovation Hall");
    expect(fields.location()).toHaveValue("Block A");
    expect(fields.capacity()).toHaveValue(120);
    expect(fields.facilities()).toHaveValue("Projector, Stage");
    expect(fields.description()).toHaveValue("Big room");
    expect(fields.accessibility()).toHaveValue("Ramp");
    expect(screen.getByRole("button", { name: "Mon" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Theatre" })).toHaveAttribute("aria-pressed", "true");
  });

  // AC02: every missing mandatory field is highlighted together.
  it("blocks an empty submission and highlights every mandatory field at once", async () => {
    const user = userEvent.setup();
    renderForm({ initialValues: structuredClone(emptyVenueFormValues) });

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Check the highlighted fields and try again.")).toBeInTheDocument();
    const alerts = screen.getAllByRole("alert").map((alert) => alert.textContent);
    expect(alerts).toEqual(
      expect.arrayContaining([
        "Venue name must contain between 2 and 160 characters",
        "Enter the venue location",
        "Enter capacity as a positive whole number",
        "Select at least one supported room layout",
        "Each operating hours period needs at least one day selected",
        "Add at least one facility",
      ]),
    );
    expect(fields.name()).toHaveAttribute("aria-invalid", "true");
    expect(fields.capacity()).toHaveAttribute("aria-invalid", "true");
  });

  it("collapses several operating-hours issues into the first one under that single field", async () => {
    const user = userEvent.setup();
    renderForm({
      initialValues: validValues({
        operatingHours: [{ days: ["mon"], opensAt: "", closesAt: "" }],
      }),
    });

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual([
      "Enter a valid opening time (HH:MM)",
    ]);
  });

  it("submits the edited, parsed values", async () => {
    const user = userEvent.setup();
    renderForm({ initialValues: structuredClone(emptyVenueFormValues) });

    await user.type(fields.name(), "  Innovation Hall  ");
    await user.type(fields.location(), "Block A");
    await user.type(fields.capacity(), "80");
    await user.click(screen.getByRole("button", { name: "Theatre" }));
    await user.click(screen.getByRole("button", { name: "Mon" }));
    await user.click(screen.getByRole("button", { name: "Tue" }));
    fireEvent.change(screen.getByLabelText("Opens"), { target: { value: "08:30" } });
    fireEvent.change(screen.getByLabelText("Closes"), { target: { value: "17:00" } });
    await user.type(fields.facilities(), "Projector, , Stage ");
    await user.type(fields.description(), "Bright room");
    await user.type(fields.accessibility(), "Lift access");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSave).toHaveBeenCalledWith({
      name: "Innovation Hall",
      location: "Block A",
      capacity: "80",
      operatingHours: [{ days: ["mon", "tue"], opensAt: "08:30", closesAt: "17:00" }],
      facilities: ["Projector", "Stage"],
      layouts: ["Theatre"],
      description: "Bright room",
      accessibilityNotes: "Lift access",
    });
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
  });

  it("calls onCancel", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables both buttons and shows progress while saving", async () => {
    const user = userEvent.setup();
    let finishSave!: () => void;
    onSave.mockReturnValue(new Promise<void>((resolve) => (finishSave = resolve)));
    renderForm();

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    finishSave();
    expect(await screen.findByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  describe("capacity warning (AC05/AC07)", () => {
    it("saves straight away when no at-risk booking exceeds the new capacity", async () => {
      const user = userEvent.setup();
      renderForm({ atRiskBookings: [booking({ expectedAttendance: 100 })] });

      await user.click(screen.getByRole("button", { name: "Save changes" }));

      expect(onSave).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(/This capacity is below/)).not.toBeInTheDocument();
    });

    it("warns about one affected booking and does not save on the first click", async () => {
      const user = userEvent.setup();
      renderForm({ atRiskBookings: [booking()] });

      await user.click(screen.getByRole("button", { name: "Save changes" }));

      expect(onSave).not.toHaveBeenCalled();
      expect(
        screen.getByText("This capacity is below the expected attendance for 1 booking."),
      ).toBeInTheDocument();
      expect(
        screen.getByText('"Leadership Summit" — expects 150 attendees (approved)'),
      ).toBeInTheDocument();
      expect(screen.getByText(/Saving will mark this booking as Needs Review/)).toBeInTheDocument();
      expect(
        screen.getByText("Review the warning below, then save again to confirm this capacity change."),
      ).toBeInTheDocument();
    });

    it("pluralises the warning for several affected bookings", async () => {
      const user = userEvent.setup();
      renderForm({
        atRiskBookings: [
          booking(),
          booking({ id: "booking-2", eventTitle: "Gala", expectedAttendance: 200, status: "pending" }),
        ],
      });

      await user.click(screen.getByRole("button", { name: "Save changes" }));

      expect(
        screen.getByText("This capacity is below the expected attendance for 2 bookings."),
      ).toBeInTheDocument();
      expect(screen.getByText(/Saving will mark these bookings as Needs Review/)).toBeInTheDocument();
    });

    it("saves when the staff member confirms with Save anyway", async () => {
      const user = userEvent.setup();
      renderForm({ atRiskBookings: [booking()] });

      await user.click(screen.getByRole("button", { name: "Save changes" }));
      await user.click(screen.getByRole("button", { name: "Save anyway" }));

      expect(onSave).toHaveBeenCalledTimes(1);
    });

    it("clears the warning when a field changes, so the next save re-checks", async () => {
      const user = userEvent.setup();
      renderForm({ atRiskBookings: [booking()] });

      await user.click(screen.getByRole("button", { name: "Save changes" }));
      await user.clear(fields.capacity());
      await user.type(fields.capacity(), "90");

      expect(screen.queryByText(/This capacity is below/)).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Save changes" }));
      expect(onSave).not.toHaveBeenCalled();
      expect(screen.getByText(/This capacity is below/)).toBeInTheDocument();
    });
  });

  describe("save failures keep the entered values", () => {
    it("highlights the fields a database rejection names (e.g. a duplicate venue)", async () => {
      const user = userEvent.setup();
      onSave.mockRejectedValue(
        new EventSubmissionError("A venue with this name already exists at this location", {
          name: "A venue with this name already exists at this location",
        }),
      );
      renderForm();

      await user.click(screen.getByRole("button", { name: "Save changes" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "A venue with this name already exists at this location",
      );
      expect(fields.name()).toHaveAttribute("aria-invalid", "true");
      expect(fields.name()).toHaveValue("Innovation Hall");
    });

    it.each([
      ["an EventSubmissionError without field errors", new EventSubmissionError("Only venue staff can manage venues"), "Only venue staff can manage venues"],
      ["a plain Error", new Error("Network down"), "Network down"],
      ["a non-Error value", "boom", "This venue could not be saved. Try again."],
    ])("shows the message for %s", async (_label, failure, message) => {
      const user = userEvent.setup();
      onSave.mockRejectedValue(failure);
      renderForm();

      await user.click(screen.getByRole("button", { name: "Save changes" }));

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.queryAllByRole("alert")).toHaveLength(0);
      expect(fields.location()).toHaveValue("Block A");
      expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
    });
  });
});
