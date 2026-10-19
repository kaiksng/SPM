import {
  emptyVenueFormValues,
  EventSubmissionError,
  type VenueBookingAtRisk,
  type VenueFormValues,
} from "@spm/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const uploadVenueImageMock = vi.fn<(file: File) => Promise<string>>();
vi.mock("@/features/venues/services/venues", () => ({
  uploadVenueImage: (file: File) => uploadVenueImageMock(file),
}));

import { VenueForm } from "./venue-form";

const onSave = vi.fn<(values: VenueFormValues) => Promise<void>>();
const onCancel = vi.fn();

function validValues(overrides: Partial<VenueFormValues> = {}): VenueFormValues {
  return {
    name: "Innovation Hall",
    location: "Block A",
    areaTags: ["Central Area"],
    capacity: "120",
    operatingHours: [{ days: ["mon"], opensAt: "09:00", closesAt: "18:00" }],
    facilities: ["Projector", "Stage"],
    layouts: ["Theatre"],
    description: "",
    accessibilityNotes: "",
    imageUrl: "",
    setupTimeMinutes: "0",
    turnaroundTimeMinutes: "0",
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

// Field wraps each input in a bare <span> label, not a real <label for>
// (see venue-form.tsx's comment on why), so the three number inputs can
// only be told apart by DOM order: Capacity, then Setup time, then
// Turnaround time.
const fields = {
  name: () => screen.getByPlaceholderText("e.g. Innovation Hall"),
  location: () => screen.getByPlaceholderText("Optional building or street address"),
  capacity: () => screen.getAllByRole("spinbutton")[0]!,
  setupTime: () => screen.getAllByRole("spinbutton")[1]!,
  turnaroundTime: () => screen.getAllByRole("spinbutton")[2]!,
  description: () => screen.getByPlaceholderText("Notes coordinators should know before booking."),
  accessibility: () =>
    screen.getByPlaceholderText("Describe accessibility features, or leave blank if none."),
};

beforeEach(() => {
  onSave.mockReset().mockResolvedValue(undefined);
  onCancel.mockReset();
  uploadVenueImageMock.mockReset();
});

describe("VenueForm", () => {
  it("shows the default submit label and helper text when no label is given", () => {
    render(<VenueForm initialValues={validValues()} onSave={onSave} onCancel={onCancel} />);

    expect(screen.getByRole("button", { name: "Save venue" })).toBeEnabled();
    expect(
      screen.getByText(/Name, location, capacity, operating hours and room layout/),
    ).toBeInTheDocument();
  });

  it("pre-fills every field from initialValues (edit mode)", async () => {
    const user = userEvent.setup();
    renderForm({
      initialValues: validValues({
        description: "Big room",
        accessibilityNotes: "Ramp",
        setupTimeMinutes: "15",
        turnaroundTimeMinutes: "30",
      }),
    });

    expect(fields.name()).toHaveValue("Innovation Hall");
    expect(fields.location()).toHaveValue("Block A");
    expect(fields.capacity()).toHaveValue(120);
    expect(fields.setupTime()).toHaveValue(15);
    expect(fields.turnaroundTime()).toHaveValue(30);
    expect(screen.getByRole("combobox", { name: "Location" })).toHaveValue("Central Area");
    expect(screen.queryByText("Venue areas")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Select facilities/ }));
    expect(await screen.findByText("Projector (previously saved)")).toBeInTheDocument();
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
        "Select a location",
        "Enter capacity as a positive whole number",
        "Select the venue's supported room layout",
        "Each operating hours period needs at least one day selected",
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

    // Longer text is pasted (one input event) rather than typed key by key:
    // every keystroke re-renders the whole form, and ~60 of them pushed this
    // test past Vitest's per-test timeout on a busy machine. This test is
    // about the submitted values, not per-keystroke handling.
    await user.click(fields.name());
    await user.paste("  Innovation Hall  ");
    await user.click(fields.location());
    await user.paste("Block A");
    await user.type(fields.capacity(), "80");
    await user.clear(fields.setupTime());
    await user.type(fields.setupTime(), "15");
    await user.clear(fields.turnaroundTime());
    await user.type(fields.turnaroundTime(), "30");
    await user.click(screen.getByRole("button", { name: "Theatre" }));
    await user.click(screen.getByRole("button", { name: "Mon" }));
    await user.click(screen.getByRole("button", { name: "Tue" }));
    fireEvent.change(screen.getByLabelText("Opens"), { target: { value: "08:30" } });
    fireEvent.change(screen.getByLabelText("Closes"), { target: { value: "17:00" } });
    await user.selectOptions(screen.getByRole("combobox", { name: "Location" }), "Bugis");
    await user.click(screen.getByText("Select facilities (0 selected)"));
    await user.click(screen.getByRole("checkbox", { name: "Pantry" }));
    await user.click(fields.description());
    await user.paste("Bright room");
    await user.click(fields.accessibility());
    await user.paste("Lift access");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSave).toHaveBeenCalledWith({
      name: "Innovation Hall",
      location: "Block A",
      areaTags: ["Bugis"],
      capacity: "80",
      operatingHours: [{ days: ["mon", "tue"], opensAt: "08:30", closesAt: "17:00" }],
      facilities: ["Pantry"],
      layouts: ["Theatre"],
      description: "Bright room",
      accessibilityNotes: "Lift access",
      imageUrl: "",
      setupTimeMinutes: "15",
      turnaroundTimeMinutes: "30",
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

  describe("venue photo", () => {
    function jpgFile(name = "venue.jpg") {
      return new File(["fake image data"], name, { type: "image/jpeg" });
    }

    it("uploads a picked photo on save and includes the returned url", async () => {
      const user = userEvent.setup();
      uploadVenueImageMock.mockResolvedValue("https://example.test/venue-images/venue.jpg");
      renderForm();

      await user.upload(screen.getByLabelText("Venue photo"), jpgFile());
      await user.click(screen.getByRole("button", { name: "Save changes" }));

      expect(uploadVenueImageMock).toHaveBeenCalledWith(jpgFile());
      await waitFor(() =>
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({ imageUrl: "https://example.test/venue-images/venue.jpg" }),
        ),
      );
    });

    it("rejects a file that isn't JPG, PNG, or WebP", async () => {
      renderForm();

      // userEvent.upload respects the input's accept attribute and would
      // silently skip a mismatched file -- fireEvent bypasses that to
      // actually exercise the validation code, the same way a browser
      // would if accept were spoofed or unsupported.
      fireEvent.change(screen.getByLabelText("Venue photo"), {
        target: { files: [new File(["data"], "venue.gif", { type: "image/gif" })] },
      });

      expect(
        await screen.findByText("Upload a JPG, PNG, or WebP image."),
      ).toBeInTheDocument();
      expect(uploadVenueImageMock).not.toHaveBeenCalled();
    });

    it("rejects a file over 5MB", async () => {
      const user = userEvent.setup();
      renderForm();

      const tooBig = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "venue.jpg", {
        type: "image/jpeg",
      });
      await user.upload(screen.getByLabelText("Venue photo"), tooBig);

      expect(await screen.findByText("The image must be smaller than 5MB.")).toBeInTheDocument();
      expect(uploadVenueImageMock).not.toHaveBeenCalled();
    });

    it("removing an existing photo clears it on save", async () => {
      const user = userEvent.setup();
      renderForm({
        initialValues: validValues({ imageUrl: "https://example.test/venue-images/old.jpg" }),
      });

      await user.click(screen.getByRole("button", { name: "Remove" }));
      await user.click(screen.getByRole("button", { name: "Save changes" }));

      expect(uploadVenueImageMock).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: "" })),
      );
    });
  });
});
