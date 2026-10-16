import type { EquipmentUnavailabilityFormValues } from "@spm/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock, rpcMock } = vi.hoisted(() => ({ fromMock: vi.fn(), rpcMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({ supabase: { from: fromMock, rpc: rpcMock } }));

import {
  endEquipmentUnavailability,
  listEquipmentUnavailability,
  listOverlappingReservations,
  recordEquipmentUnavailability,
  removeEquipmentUnavailability,
} from "./equipment-unavailability";

function formValues(
  overrides: Partial<EquipmentUnavailabilityFormValues> = {},
): EquipmentUnavailabilityFormValues {
  return {
    equipmentItemId: "item-1",
    quantity: "03",
    unitIds: [],
    reason: "  Sent for repair  ",
    startsAt: "2099-04-01T10:00",
    endsAt: "2099-04-03T18:00",
    ...overrides,
  };
}

beforeEach(() => {
  fromMock.mockReset();
  rpcMock.mockReset();
});

describe("recordEquipmentUnavailability", () => {
  // SPM-30 AC01: item, quantity, Singapore-local period and reason are recorded.
  it("records the item, quantity, reason and period, converting Singapore time to UTC", async () => {
    rpcMock.mockResolvedValue({ data: "record-1", error: null });

    await recordEquipmentUnavailability(formValues());

    expect(rpcMock).toHaveBeenCalledWith("record_equipment_unavailability", {
      p_equipment_item_id: "item-1",
      p_quantity: 3,
      p_reason: "Sent for repair",
      p_starts_at: "2099-04-01T02:00:00.000Z",
      p_ends_at: "2099-04-03T10:00:00.000Z",
      p_unit_ids: undefined,
    });
  });

  // SPM-30 AC01: naming specific units records that many, ignoring the quantity box.
  it("records the chosen units and counts them as the quantity", async () => {
    rpcMock.mockResolvedValue({ data: "record-1", error: null });

    await recordEquipmentUnavailability(formValues({ quantity: "", unitIds: ["unit-1", "unit-2"] }));

    expect(rpcMock).toHaveBeenCalledWith(
      "record_equipment_unavailability",
      expect.objectContaining({ p_quantity: 2, p_unit_ids: ["unit-1", "unit-2"] }),
    );
  });

  // SPM-30 AC01 + AC02: invalid input is refused before anything is sent.
  it.each([
    ["a quantity of zero", { quantity: "0" }, "Enter a positive whole number"],
    ["a fractional quantity", { quantity: "1.5" }, "Enter a positive whole number"],
    ["a blank reason", { reason: "   " }, "Enter a reason"],
    ["an end before the start", { endsAt: "2099-04-01T09:00" }, "End time must be after start time"],
    ["an end equal to the start", { endsAt: "2099-04-01T10:00" }, "End time must be after start time"],
  ])("refuses %s without calling the database", async (_label, overrides, message) => {
    await expect(recordEquipmentUnavailability(formValues(overrides))).rejects.toThrow(message);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("passes on the database's reason when it refuses the record", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "Only 2 units of this item are in service" },
    });

    await expect(recordEquipmentUnavailability(formValues())).rejects.toThrow(
      "Only 2 units of this item are in service",
    );
  });
});

describe("ending and removing a record", () => {
  // SPM-30 AC05: the equipment returns to service early.
  it("ends a record through end_equipment_unavailability", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    await endEquipmentUnavailability("record-1");

    expect(rpcMock).toHaveBeenCalledWith("end_equipment_unavailability", {
      p_unavailability_id: "record-1",
    });
  });

  // SPM-30 AC05: a record entered in error, or no longer needed, is removed.
  it("removes a record through remove_equipment_unavailability", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    await removeEquipmentUnavailability("record-1");

    expect(rpcMock).toHaveBeenCalledWith("remove_equipment_unavailability", {
      p_unavailability_id: "record-1",
    });
  });

  it.each([
    ["ending", () => endEquipmentUnavailability("record-1"), "Only an in-progress record can be ended"],
    ["removing", () => removeEquipmentUnavailability("record-1"), "Past records cannot be removed"],
  ])("passes on the database's reason when %s is refused", async (_label, action, message) => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "23514", message } });

    await expect(action()).rejects.toThrow(message);
  });
});

describe("listEquipmentUnavailability", () => {
  // SPM-30 AC06: current and past records keep who recorded, ended and removed
  // them, the reason and the times — newest first.
  it("lists every record, newest first, with its reason, actors and times", async () => {
    const query = queryBuilder({
      data: [
        {
          id: "record-1",
          equipment_item_id: "item-1",
          quantity: 2,
          reason: "Sent for repair",
          starts_at: "2099-04-01T02:00:00Z",
          ends_at: "2099-04-03T10:00:00Z",
          recorded_at: "2099-03-31T01:00:00Z",
          ended_at: "2099-04-02T01:00:00Z",
          removed_at: null,
          equipment_item: { name: "Wireless microphone" },
          units: [{ unit_id: "unit-1" }, { unit_id: "unit-2" }],
          recorded_by_profile: { full_name: "Sam Support" },
          ended_by_profile: { full_name: "Tess Support" },
          removed_by_profile: null,
        },
      ],
      error: null,
    });
    fromMock.mockReturnValue(query);

    await expect(listEquipmentUnavailability()).resolves.toEqual([
      {
        id: "record-1",
        equipmentItemId: "item-1",
        equipmentName: "Wireless microphone",
        quantity: 2,
        unitIds: ["unit-1", "unit-2"],
        reason: "Sent for repair",
        startsAt: "2099-04-01T02:00:00Z",
        endsAt: "2099-04-03T10:00:00Z",
        recordedAt: "2099-03-31T01:00:00Z",
        recordedByName: "Sam Support",
        endedAt: "2099-04-02T01:00:00Z",
        endedByName: "Tess Support",
        removedAt: null,
        removedByName: null,
      },
    ]);
    expect(fromMock).toHaveBeenCalledWith("equipment_unavailability");
    // Removed and ended records are not filtered out: the history keeps them.
    expect(query.is).not.toHaveBeenCalled();
    expect(query.order).toHaveBeenCalledWith("recorded_at", { ascending: false });
  });

  it("throws a readable error when the records cannot be loaded", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: { message: "boom" } }));

    await expect(listEquipmentUnavailability()).rejects.toThrow(
      "We couldn't load the unavailability records.",
    );
  });
});

describe("listOverlappingReservations", () => {
  // SPM-30 AC03: Pending and Confirmed reservations of the item that overlap
  // the period are shown before saving.
  it("finds the item's Pending and Confirmed reservations that overlap the period", async () => {
    const query = queryBuilder({
      data: [
        {
          id: "reservation-1",
          quantity: 2,
          status: "approved",
          starts_at: "2099-04-01T01:00:00Z",
          ends_at: "2099-04-01T05:00:00Z",
          event: { title: "Career Fair" },
        },
      ],
      error: null,
    });
    fromMock.mockReturnValue(query);

    await expect(
      listOverlappingReservations("item-1", "2099-04-01T02:00:00.000Z", "2099-04-03T10:00:00.000Z"),
    ).resolves.toEqual([
      {
        id: "reservation-1",
        quantity: 2,
        status: "approved",
        startsAt: "2099-04-01T01:00:00Z",
        endsAt: "2099-04-01T05:00:00Z",
        eventTitle: "Career Fair",
      },
    ]);
    expect(fromMock).toHaveBeenCalledWith("equipment_reservations");
    expect(query.eq).toHaveBeenCalledWith("equipment_item_id", "item-1");
    expect(query.in).toHaveBeenCalledWith("status", ["pending", "approved"]);
    // Overlapping, not merely touching: starts before the period ends and ends after it starts.
    expect(query.lt).toHaveBeenCalledWith("starts_at", "2099-04-03T10:00:00.000Z");
    expect(query.gt).toHaveBeenCalledWith("ends_at", "2099-04-01T02:00:00.000Z");
  });

  it("throws a readable error when reservations cannot be checked", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: { message: "boom" } }));

    await expect(
      listOverlappingReservations("item-1", "2099-04-01T02:00:00.000Z", "2099-04-03T10:00:00.000Z"),
    ).rejects.toThrow("We couldn't check reservations for this period.");
  });
});
