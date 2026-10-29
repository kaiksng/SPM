import { describe, expect, it } from "vitest";

import { isLocationArea, LOCATION_AREAS } from "./event-choices";

describe("isLocationArea", () => {
  // SPM-21 AC: location is matched against the standard list of areas.
  it("recognises a standard area regardless of letter case", () => {
    expect(isLocationArea(LOCATION_AREAS[0])).toBe(true);
    expect(isLocationArea("bugis")).toBe(true);
    expect(isLocationArea("ANG MO KIO")).toBe(true);
  });

  it("does not recognise an area outside the list or a blank value", () => {
    expect(isLocationArea("Atlantis")).toBe(false);
    expect(isLocationArea("")).toBe(false);
  });
});
