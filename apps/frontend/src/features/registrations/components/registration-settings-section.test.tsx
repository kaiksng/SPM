import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SavedRegistrationSettings } from "@/features/registrations/services/registration-settings";

const { loadMainVenueCapacityMock, saveRegistrationSettingsMock } = vi.hoisted(() => ({
  loadMainVenueCapacityMock: vi.fn(),
  saveRegistrationSettingsMock: vi.fn(),
}));

vi.mock("@/features/registrations/services/registration-settings", () => ({
  loadMainVenueCapacity: loadMainVenueCapacityMock,
  saveRegistrationSettings: saveRegistrationSettingsMock,
}));

import { RegistrationSettingsSection } from "./registration-settings-section";

const configured: SavedRegistrationSettings = {
  required: true,
  opensAt: "2099-01-01T01:00:00.000Z",
  closesAt: "2099-01-10T10:00:00.000Z",
  capacity: 120,
  waitlistEnabled: true,
  withdrawalPermitted: false,
};

const unconfigured: SavedRegistrationSettings = {
  required: true,
  opensAt: null,
  closesAt: null,
  capacity: 80,
  waitlistEnabled: false,
  withdrawalPermitted: false,
};

function renderSection(
  props: Partial<Parameters<typeof RegistrationSettingsSection>[0]> = {},
) {
  const onSaved = vi.fn();
  render(
    <RegistrationSettingsSection
      eventId="event-1"
      status="planning"
      registration={configured}
      isOwnOrganiser
      onSaved={onSaved}
      {...props}
    />,
  );
  return { onSaved };
}

describe("RegistrationSettingsSection", () => {
  beforeEach(() => {
    loadMainVenueCapacityMock.mockReset().mockResolvedValue(null);
    saveRegistrationSettingsMock.mockReset();
  });

  it("shows all five saved settings", () => {
    renderSection();

    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("Enabled")).toBeInTheDocument();
    expect(screen.getByText("Not permitted")).toBeInTheDocument();
  });

  // AC02/AC03: the organiser sets all five settings in Planning and saves.
  it("saves the organiser's settings while the event is in Planning", async () => {
    const user = userEvent.setup();
    const saved = { ...unconfigured, opensAt: configured.opensAt, closesAt: configured.closesAt, capacity: 80 };
    saveRegistrationSettingsMock.mockResolvedValue(saved);
    const { onSaved } = renderSection({ registration: unconfigured });

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.type(screen.getByLabelText("Opens (Singapore time)"), "2099-01-01T09:00");
    await user.type(screen.getByLabelText("Closes (Singapore time)"), "2099-01-10T18:00");
    await user.click(within(screen.getByRole("group", { name: "Attendees may withdraw" })).getByLabelText("Yes"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(saveRegistrationSettingsMock).toHaveBeenCalledWith("event-1", {
      required: true,
      opensAt: "2099-01-01T09:00",
      closesAt: "2099-01-10T18:00",
      capacity: "80",
      waitlistEnabled: false,
      withdrawalPermitted: true,
    });
    expect(onSaved).toHaveBeenCalledWith(saved);
  });

  // AC04/AC05: an invalid setting saves nothing and names the field.
  it("shows which setting to fix and saves nothing when closing is before opening", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const closes = screen.getByLabelText("Closes (Singapore time)");
    await user.clear(closes);
    await user.type(closes, "2098-12-31T09:00");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Registration closing time must be after its opening time")).toBeInTheDocument();
    expect(saveRegistrationSettingsMock).not.toHaveBeenCalled();
  });

  // AC08: capacity above the approved main venue's capacity is refused.
  it("refuses a capacity above the main venue's capacity", async () => {
    const user = userEvent.setup();
    loadMainVenueCapacityMock.mockResolvedValue(100);
    renderSection();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByText("Main venue capacity: 100")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Registration capacity cannot exceed the main venue's capacity of 100"),
    ).toBeInTheDocument();
    expect(saveRegistrationSettingsMock).not.toHaveBeenCalled();
  });

  // AC08: a smaller venue approved later is flagged, not auto-corrected.
  it("flags saved capacity that is now above the main venue's capacity", async () => {
    loadMainVenueCapacityMock.mockResolvedValue(100);
    renderSection();

    expect(
      await screen.findByText(/Capacity \(120\) is more than the main venue's capacity \(100\)/),
    ).toBeInTheDocument();
  });

  // AC07: required but unconfigured blocks the safety check.
  it("tells the organiser to complete unconfigured settings", () => {
    renderSection({ registration: unconfigured });

    expect(screen.getByText(/can't go to the safety check until they're set/)).toBeInTheDocument();
  });

  // AC05: turning registration off needs nothing else.
  it("saves registration off without any other settings", async () => {
    const user = userEvent.setup();
    saveRegistrationSettingsMock.mockResolvedValue({ ...configured, required: false });
    renderSection();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByLabelText("Attendee registration is required"));
    expect(screen.queryByLabelText("Opens (Singapore time)")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(saveRegistrationSettingsMock).toHaveBeenCalledWith(
      "event-1",
      expect.objectContaining({ required: false }),
    );
  });

  // AC07: from Pending Safety Check onward the settings are read-only.
  it.each(["pending_safety_check", "confirmed", "completed", "cancelled", "rejected"])(
    "offers no edit once the event is %s",
    (status) => {
      renderSection({ status });

      expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    },
  );

  // AC01: before Planning the organiser only chooses whether it's required.
  it("tells the organiser the rules come later while the event is a request", () => {
    renderSection({ status: "requested" });

    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.getByText("You can set the registration rules once your event reaches Planning.")).toBeInTheDocument();
  });

  // AC02: only the event's own organiser can edit.
  it("offers no edit to anyone but the event's organiser", () => {
    renderSection({ isOwnOrganiser: false });

    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(loadMainVenueCapacityMock).not.toHaveBeenCalled();
  });
});
