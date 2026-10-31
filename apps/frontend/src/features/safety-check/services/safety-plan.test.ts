import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({ supabase: { rpc: rpcMock } }));

import { saveEquipmentPlacement, saveVenueSafetyChecks } from "./safety-plan";

const checks = {
  emergencyAccessChecked: true,
  emergencyAccess: " Exits B and C ",
  restrictionsChecked: true,
  restrictions: "",
  crowdMovementChecked: false,
  crowdMovementPlan: "",
};

beforeEach(() => {
  rpcMock.mockReset().mockResolvedValue({ data: null, error: null });
});

describe("saveVenueSafetyChecks (SPM-90)", () => {
  it("saves the ticks with their trimmed details", async () => {
    await expect(saveVenueSafetyChecks("event-1", checks)).resolves.toEqual({ ...checks, emergencyAccess: "Exits B and C" });
    expect(rpcMock).toHaveBeenCalledWith("set_event_venue_safety_checks", {
      p_event_id: "event-1",
      p_emergency_access_checked: true,
      p_emergency_access: "Exits B and C",
      p_restrictions_checked: true,
      p_restrictions: "",
      p_crowd_movement_checked: false,
      p_crowd_movement_plan: "",
    });
  });

  it("refuses over-long details before calling the database", async () => {
    await expect(saveVenueSafetyChecks("event-1", { ...checks, crowdMovementPlan: "x".repeat(2001) })).rejects.toThrow();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("shows the database's reason when it refuses", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "Safety checks can only be changed while the event is in Planning" },
    });

    await expect(saveVenueSafetyChecks("event-1", checks)).rejects.toThrow(
      "Safety checks can only be changed while the event is in Planning",
    );
  });
});

describe("saveEquipmentPlacement (SPM-90)", () => {
  it("saves the trimmed placement", async () => {
    await expect(saveEquipmentPlacement("event-1", { equipmentPlacement: " Stage left " })).resolves.toEqual({
      equipmentPlacement: "Stage left",
    });
    expect(rpcMock).toHaveBeenCalledWith("set_event_equipment_placement", {
      p_event_id: "event-1",
      p_equipment_placement: "Stage left",
    });
  });

  it("shows a general message for an unexpected failure", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });

    await expect(saveEquipmentPlacement("event-1", { equipmentPlacement: "Stage left" })).rejects.toThrow(
      "The safety checks could not be saved. Your changes are still here.",
    );
  });
});
