import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const saveVenueSafetyChecksMock = vi.fn();
vi.mock("@/features/safety-check/services/safety-plan", () => ({
  saveVenueSafetyChecks: (...args: unknown[]) => saveVenueSafetyChecksMock(...args),
}));

import { VenueSafetyChecksSection } from "./venue-safety-checks-section";

const onSaved = vi.fn();
const unchecked = {
  emergencyAccessChecked: false,
  emergencyAccess: null,
  restrictionsChecked: false,
  restrictions: null,
  crowdMovementChecked: false,
  crowdMovementPlan: null,
};

beforeEach(() => {
  onSaved.mockReset();
  saveVenueSafetyChecksMock.mockReset().mockImplementation((_id: string, values: unknown) => Promise.resolve(values));
});

describe("VenueSafetyChecksSection (SPM-90)", () => {
  it("lets the assigned coordinator tick each check, with details only where needed", async () => {
    const user = userEvent.setup();
    render(<VenueSafetyChecksSection eventId="event-1" checks={unchecked} canEdit onSaved={onSaved} />);

    await user.click(screen.getByRole("checkbox", { name: "Emergency access checked" }));
    await user.type(screen.getByRole("textbox", { name: "Emergency access checked: details" }), "Exits B and C");
    await user.click(screen.getByRole("checkbox", { name: "Known restrictions checked" }));
    await user.click(screen.getByRole("checkbox", { name: "Crowd movement planned" }));
    await user.click(screen.getByRole("button", { name: "Save safety checks" }));

    expect(saveVenueSafetyChecksMock).toHaveBeenCalledWith("event-1", {
      emergencyAccessChecked: true,
      emergencyAccess: "Exits B and C",
      restrictionsChecked: true,
      restrictions: "",
      crowdMovementChecked: true,
      crowdMovementPlan: "",
    });
    expect(onSaved).toHaveBeenCalledWith(
      {
        emergencyAccessChecked: true,
        emergencyAccess: "Exits B and C",
        restrictionsChecked: true,
        restrictions: null,
        crowdMovementChecked: true,
        crowdMovementPlan: null,
      },
      [],
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Safety checks saved.");
  });

  it("shows the reason when saving fails", async () => {
    saveVenueSafetyChecksMock.mockRejectedValue(new Error("Safety checks can only be changed while the event is in Planning"));
    const user = userEvent.setup();
    render(<VenueSafetyChecksSection eventId="event-1" checks={unchecked} canEdit onSaved={onSaved} />);

    await user.click(screen.getByRole("button", { name: "Save safety checks" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Safety checks can only be changed while the event is in Planning",
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("is read-only for everyone else, showing what was checked", () => {
    render(
      <VenueSafetyChecksSection
        eventId="event-1"
        checks={{ ...unchecked, emergencyAccessChecked: true, emergencyAccess: "Exits B and C" }}
        canEdit={false}
        onSaved={onSaved}
      />,
    );

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save safety checks" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Checked")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Not checked")).toHaveLength(2);
    expect(screen.getByText("Exits B and C")).toBeInTheDocument();
  });

  it("shows a flagged check with the Safety Officer's reason, and clears the flag once ticked", async () => {
    const user = userEvent.setup();
    render(
      <VenueSafetyChecksSection
        eventId="event-1"
        checks={{ ...unchecked, restrictionsChecked: true, crowdMovementChecked: true }}
        flags={["emergency_access", "crowd_movement"]}
        flagReason="The rear exit is blocked."
        canEdit
        onSaved={onSaved}
      />,
    );

    expect(screen.getAllByText("The Safety Officer asked for this to be revised: The rear exit is blocked.")).toHaveLength(2);
    await user.click(screen.getByRole("checkbox", { name: "Emergency access checked" }));
    await user.click(screen.getByRole("button", { name: "Save safety checks" }));

    // Emergency access is ticked now; crowd movement was already ticked, so both clear.
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ emergencyAccessChecked: true }), []);
  });

  it("keeps the flag on a check that is still unticked", async () => {
    const user = userEvent.setup();
    render(
      <VenueSafetyChecksSection
        eventId="event-1"
        checks={unchecked}
        flags={["restrictions"]}
        flagReason="Check the noise curfew."
        canEdit
        onSaved={onSaved}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save safety checks" }));

    expect(onSaved).toHaveBeenCalledWith(expect.anything(), ["restrictions"]);
  });
});

