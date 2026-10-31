import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const saveEquipmentPlacementMock = vi.fn();
vi.mock("@/features/safety-check/services/safety-plan", () => ({
  saveEquipmentPlacement: (...args: unknown[]) => saveEquipmentPlacementMock(...args),
}));

import { EquipmentPlacementSection } from "./equipment-placement-section";

const onSaved = vi.fn();

beforeEach(() => {
  onSaved.mockReset();
  saveEquipmentPlacementMock.mockReset().mockImplementation((_id: string, values: unknown) => Promise.resolve(values));
});

describe("EquipmentPlacementSection (SPM-90)", () => {
  it("lets the assigned coordinator record where the equipment goes", async () => {
    const user = userEvent.setup();
    render(<EquipmentPlacementSection eventId="event-1" equipmentPlacement={null} canEdit onSaved={onSaved} />);

    await user.type(screen.getByRole("textbox", { name: "Equipment placement" }), "Stage left");
    await user.click(screen.getByRole("button", { name: "Save equipment placement" }));

    expect(saveEquipmentPlacementMock).toHaveBeenCalledWith("event-1", { equipmentPlacement: "Stage left" });
    expect(onSaved).toHaveBeenCalledWith("Stage left");
    expect(await screen.findByRole("status")).toHaveTextContent("Equipment placement saved.");
  });

  it("shows the reason when saving fails", async () => {
    saveEquipmentPlacementMock.mockRejectedValue(new Error("Safety checks can only be changed while the event is in Planning"));
    const user = userEvent.setup();
    render(<EquipmentPlacementSection eventId="event-1" equipmentPlacement="Old" canEdit onSaved={onSaved} />);

    await user.click(screen.getByRole("button", { name: "Save equipment placement" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Safety checks can only be changed while the event is in Planning");
  });

  it("is read-only for everyone else", () => {
    render(<EquipmentPlacementSection eventId="event-1" equipmentPlacement={null} canEdit={false} onSaved={onSaved} />);

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("Not provided yet")).toBeInTheDocument();
  });
});
