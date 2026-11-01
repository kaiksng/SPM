import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock, rpcMock } = vi.hoisted(() => ({ fromMock: vi.fn(), rpcMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({ supabase: { from: fromMock, rpc: rpcMock } }));

import {
  addEquipmentUnits,
  createEquipmentItem,
  listEquipmentCatalogue,
  listInventory,
  setEquipmentItemRetired,
  setEquipmentUnitRetired,
  updateEquipmentItem,
} from "./equipment-inventory";

const itemRow = {
  id: "item-1",
  name: "Projector",
  category: "Audio Visual",
  code: "pj",
  total_quantity: 2,
  retired_at: null,
};

const validItem = { name: "  Projector ", category: "Audio Visual", code: "PJ" };

function unitRow(unitNumber: number, itemId = "item-1") {
  return { id: `unit-${unitNumber}`, equipment_item_id: itemId, unit_number: unitNumber, retired_at: null };
}

/** Answers equipment_items and each page of equipment_units from separate results. */
function mockTables(
  items: { data: unknown; error: unknown },
  unitPages: { data: unknown; error: unknown }[],
) {
  const unitQueries: ReturnType<typeof queryBuilder>[] = [];
  let page = 0;
  fromMock.mockImplementation((table: string) => {
    if (table === "equipment_items") return queryBuilder(items);
    const query = queryBuilder(unitPages[page++] ?? { data: [], error: null });
    unitQueries.push(query);
    return query;
  });
  return unitQueries;
}

beforeEach(() => {
  fromMock.mockReset();
  rpcMock.mockReset().mockResolvedValue({ data: null, error: null });
});

describe("listInventory", () => {
  it("gives each item its own units", async () => {
    mockTables(
      { data: [itemRow, { ...itemRow, id: "item-2", name: "Mic", code: "mc" }], error: null },
      [{ data: [unitRow(1), unitRow(2), unitRow(1, "item-2")], error: null }],
    );

    const items = await listInventory();

    expect(items.map((item) => [item.name, item.units.map((unit) => unit.id)])).toEqual([
      ["Projector", ["unit-1", "unit-2"]],
      ["Mic", ["unit-1"]],
    ]);
    expect(items[0]).toMatchObject({ category: "Audio Visual", code: "pj", totalQuantity: 2, retiredAt: null });
    expect(items[0]?.units[0]).toEqual({ id: "unit-1", equipmentItemId: "item-1", unitNumber: 1, retiredAt: null });
  });

  it("lists an item with no units", async () => {
    mockTables({ data: [itemRow], error: null }, [{ data: [], error: null }]);

    const [item] = await listInventory();

    expect(item?.units).toEqual([]);
  });

  // PostgREST returns at most 1,000 rows, so every unit must be read page by page.
  it("reads every page of units, past the 1,000 row limit", async () => {
    const fullPage = Array.from({ length: 1000 }, (_, index) => unitRow(index + 1));
    const unitQueries = mockTables(
      { data: [itemRow], error: null },
      [{ data: fullPage, error: null }, { data: [unitRow(1001)], error: null }],
    );

    const [item] = await listInventory();

    expect(item?.units).toHaveLength(1001);
    expect(unitQueries[0]?.range).toHaveBeenCalledWith(0, 999);
    expect(unitQueries[1]?.range).toHaveBeenCalledWith(1000, 1999);
  });

  it("explains when the catalogue can't be loaded", async () => {
    mockTables({ data: null, error: { message: "denied" } }, [{ data: [], error: null }]);

    await expect(listInventory()).rejects.toThrow("We couldn't load the equipment catalogue.");
  });

  it("explains when the units can't be loaded", async () => {
    mockTables({ data: [itemRow], error: null }, [{ data: null, error: { message: "denied" } }]);

    await expect(listInventory()).rejects.toThrow("We couldn't load the equipment units.");
  });
});

describe("listEquipmentCatalogue", () => {
  // SPM-27 AC08: organisers and coordinators read item-level fields only.
  it("SPM-27 AC08: reads the catalogue by category then name, with no per-unit detail", async () => {
    const query = queryBuilder({ data: [itemRow], error: null });
    fromMock.mockReturnValue(query);

    await expect(listEquipmentCatalogue()).resolves.toEqual([
      { id: "item-1", name: "Projector", category: "Audio Visual", code: "pj", totalQuantity: 2, retiredAt: null },
    ]);
    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith("equipment_items");
    expect(query.order).toHaveBeenCalledWith("category", { ascending: true, nullsFirst: false });
    expect(query.order).toHaveBeenCalledWith("name", { ascending: true });
  });

  it("explains when the catalogue can't be loaded", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: { message: "denied" } }));

    await expect(listEquipmentCatalogue()).rejects.toThrow("We couldn't load the equipment catalogue.");
  });
});

// SPM-27 AC08: maintaining the catalogue goes through database functions that
// allow Technical Support Staff only, so their refusal must reach the page.
describe("maintaining the catalogue (SPM-27 AC08)", () => {
  it("creates an item with its first units, using the validated values", async () => {
    rpcMock.mockResolvedValue({ data: "item-1", error: null });

    await expect(createEquipmentItem(validItem, 5)).resolves.toBe("item-1");

    expect(rpcMock).toHaveBeenCalledWith("create_equipment_item", {
      p_name: "Projector",
      p_category: "Audio Visual",
      p_code: "pj",
      p_units: 5,
    });
  });

  it("refuses an invalid item before calling the database", async () => {
    await expect(createEquipmentItem({ ...validItem, name: "" }, 5)).rejects.toThrow();
    await expect(updateEquipmentItem("item-1", { ...validItem, name: "" })).rejects.toThrow();

    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("updates an item with the validated values", async () => {
    await updateEquipmentItem("item-1", validItem);

    expect(rpcMock).toHaveBeenCalledWith("update_equipment_item", {
      p_item_id: "item-1",
      p_name: "Projector",
      p_category: "Audio Visual",
      p_code: "pj",
    });
  });

  it("adds units to an item", async () => {
    await addEquipmentUnits("item-1", 3);

    expect(rpcMock).toHaveBeenCalledWith("add_equipment_units", { p_item_id: "item-1", p_count: 3 });
  });

  it.each([true, false])("sets a unit's retired state to %s", async (retired) => {
    await setEquipmentUnitRetired("unit-1", retired);

    expect(rpcMock).toHaveBeenCalledWith("set_equipment_unit_retired", { p_unit_id: "unit-1", p_retired: retired });
  });

  it.each([true, false])("sets an item's retired state to %s", async (retired) => {
    await setEquipmentItemRetired("item-1", retired);

    expect(rpcMock).toHaveBeenCalledWith("set_equipment_item_retired", { p_item_id: "item-1", p_retired: retired });
  });

  it.each([
    ["creating an item", () => createEquipmentItem(validItem, 1)],
    ["updating an item", () => updateEquipmentItem("item-1", validItem)],
    ["adding units", () => addEquipmentUnits("item-1", 1)],
    ["retiring a unit", () => setEquipmentUnitRetired("unit-1", true)],
    ["retiring an item", () => setEquipmentItemRetired("item-1", true)],
  ])("shows the database's refusal when %s", async (_label, action) => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "Only Technical Support Staff can maintain the equipment catalogue" },
    });

    await expect(action()).rejects.toThrow("Only Technical Support Staff can maintain the equipment catalogue");
  });
});
