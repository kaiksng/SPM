import { describe, expect, it } from "vitest";

import { asRoomLayoutType, ROOM_LAYOUT_TYPES } from "./venue";

describe("asRoomLayoutType", () => {
  // SPM-85 AC: a saved standard or custom layout is kept when an event reopens.
  it("keeps a standard layout and trims surrounding spaces", () => {
    expect(asRoomLayoutType("  Theatre ")).toBe("Theatre");
    expect(ROOM_LAYOUT_TYPES).toContain("Theatre");
  });

  it("keeps a custom layout as saved", () => {
    expect(asRoomLayoutType("U-shape with stage")).toBe("U-shape with stage");
  });

  it("returns an empty string when nothing was saved", () => {
    expect(asRoomLayoutType(null)).toBe("");
    expect(asRoomLayoutType(undefined)).toBe("");
    expect(asRoomLayoutType("   ")).toBe("");
  });
});
