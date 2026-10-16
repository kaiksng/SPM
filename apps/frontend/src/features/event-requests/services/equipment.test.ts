import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({ supabase: { from: fromMock } }));

import {
  loadEquipmentCatalogue,
  loadEquipmentHistory,
  toEquipmentFormValues,
  toEquipmentRequirements,
  type EquipmentRequirementRow,
} from "./equipment";

beforeEach(() => {
  fromMock.mockReset();
});

describe("loadEquipmentCatalogue", () => {
  // SPM-27 AC02: the dropdown is the catalogue, ordered by category then name.
  it("loads the catalogue ordered by category, then name, marking retired items", async () => {
    const query = queryBuilder({
      data: [
        { id: "item-1", name: "Wireless microphone", category: "Audio", retired_at: null },
        { id: "item-2", name: "Old projector", category: "Visual", retired_at: "2099-01-01T00:00:00Z" },
      ],
      error: null,
    });
    fromMock.mockReturnValue(query);

    await expect(loadEquipmentCatalogue()).resolves.toEqual([
      { id: "item-1", name: "Wireless microphone", category: "Audio", retired: false },
      { id: "item-2", name: "Old projector", category: "Visual", retired: true },
    ]);
    expect(fromMock).toHaveBeenCalledWith("equipment_items");
    expect(query.order.mock.calls).toEqual([
      ["category", { ascending: true, nullsFirst: false }],
      ["name", { ascending: true }],
    ]);
  });

  it("throws a readable error when the catalogue cannot be loaded", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: { message: "boom" } }));

    await expect(loadEquipmentCatalogue()).rejects.toThrow(
      "The equipment catalogue is unavailable. Try again.",
    );
  });
});

function requirementRow(overrides: Partial<EquipmentRequirementRow> = {}): EquipmentRequirementRow {
  return {
    id: "requirement-1",
    equipment_item_id: "item-1",
    equipment_name: "Wireless microphone",
    quantity: 2,
    required_from: "2099-04-01T00:00:00Z",
    required_until: "2099-04-01T06:00:00Z",
    notes: "XLR to the mixer",
    equipment_item: { category: "Audio" },
    ...overrides,
  };
}

describe("toEquipmentRequirements", () => {
  // SPM-27 AC01: each requirement keeps its item, quantity, period and
  // technical requirements.
  it("maps a saved requirement with its item, quantity, period and technical requirements", () => {
    expect(toEquipmentRequirements([requirementRow()])).toEqual([
      {
        id: "requirement-1",
        equipmentItemId: "item-1",
        equipmentName: "Wireless microphone",
        category: "Audio",
        quantity: 2,
        requiredFrom: "2099-04-01T00:00:00Z",
        requiredUntil: "2099-04-01T06:00:00Z",
        technicalRequirements: "XLR to the mixer",
      },
    ]);
  });

  it("orders requirements by when they are needed, legacy rows with no period last", () => {
    const rows = [
      requirementRow({ id: "legacy", equipment_item_id: null, equipment_name: "Old smoke machine", required_from: null, required_until: null, equipment_item: null }),
      requirementRow({ id: "later", required_from: "2099-04-02T00:00:00Z" }),
      requirementRow({ id: "earlier-b", equipment_name: "Projector" }),
      requirementRow({ id: "earlier-a", equipment_name: "Lectern" }),
    ];

    expect(toEquipmentRequirements(rows).map((row) => row.id)).toEqual([
      "earlier-a",
      "earlier-b",
      "later",
      "legacy",
    ]);
  });
});

describe("toEquipmentFormValues", () => {
  it("puts a saved requirement back into the form, keeping a legacy row's name", () => {
    const [catalogue, legacy] = toEquipmentFormValues(
      toEquipmentRequirements([
        requirementRow({ notes: null }),
        requirementRow({ id: "legacy", equipment_item_id: null, equipment_name: "Old smoke machine", required_from: null, required_until: null, equipment_item: null }),
      ]),
    );

    expect(catalogue).toEqual({
      id: "requirement-1",
      equipmentItemId: "item-1",
      legacyName: "",
      quantity: "2",
      requiredFrom: "2099-04-01T08:00",
      requiredUntil: "2099-04-01T14:00",
      notes: "",
    });
    expect(legacy).toMatchObject({ id: "legacy", equipmentItemId: "", legacyName: "Old smoke machine" });
  });
});

describe("loadEquipmentHistory", () => {
  const snapshot = {
    equipmentItemId: "item-1",
    equipmentName: "Wireless microphone",
    category: "Audio",
    quantity: 2,
    requiredFrom: "2099-04-01T00:00:00Z",
    requiredUntil: "2099-04-01T06:00:00Z",
    technicalRequirements: null,
  };

  // SPM-27 AC07: every addition, change and removal, in the order it happened,
  // with who made it and when; earlier entries are kept.
  it("reads the event's equipment changes oldest first, with actor, time and what changed", async () => {
    const query = queryBuilder({
      data: [
        { id: 1, change_type: "added", previous_value: null, new_value: snapshot, changed_at: "2099-03-01T00:00:00Z", changed_by: { full_name: "Jasmine" } },
        { id: 2, change_type: "changed", previous_value: snapshot, new_value: { ...snapshot, quantity: 3 }, changed_at: "2099-03-02T00:00:00Z", changed_by: { full_name: "Joyce" } },
        { id: 3, change_type: "removed", previous_value: { ...snapshot, quantity: 3 }, new_value: null, changed_at: "2099-03-03T00:00:00Z", changed_by: null },
      ],
      error: null,
    });
    fromMock.mockReturnValue(query);

    await expect(loadEquipmentHistory("event-1")).resolves.toEqual([
      { id: 1, changeType: "added", previous: null, next: snapshot, changedByName: "Jasmine", changedAt: "2099-03-01T00:00:00Z" },
      { id: 2, changeType: "changed", previous: snapshot, next: { ...snapshot, quantity: 3 }, changedByName: "Joyce", changedAt: "2099-03-02T00:00:00Z" },
      { id: 3, changeType: "removed", previous: { ...snapshot, quantity: 3 }, next: null, changedByName: null, changedAt: "2099-03-03T00:00:00Z" },
    ]);
    expect(fromMock).toHaveBeenCalledWith("event_equipment_changes");
    expect(query.eq).toHaveBeenCalledWith("event_id", "event-1");
    expect(query.order.mock.calls).toEqual([
      ["changed_at", { ascending: true }],
      ["id", { ascending: true }],
    ]);
  });

  it("skips an entry with an unrecognised change type", async () => {
    fromMock.mockReturnValue(
      queryBuilder({
        data: [{ id: 1, change_type: "renamed", previous_value: null, new_value: snapshot, changed_at: "2099-03-01T00:00:00Z", changed_by: null }],
        error: null,
      }),
    );

    await expect(loadEquipmentHistory("event-1")).resolves.toEqual([]);
  });

  it("throws a readable error when the history cannot be loaded", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: { message: "boom" } }));

    await expect(loadEquipmentHistory("event-1")).rejects.toThrow(
      "The equipment history for this event is unavailable.",
    );
  });
});
