import { describe, expect, it } from "vitest";

import { getVenueLayoutImage } from "./venue-layout-image";

describe("getVenueLayoutImage", () => {
  it("returns the photo for the venue's layout", () => {
    expect(getVenueLayoutImage(["Auditorium"])).not.toBe(getVenueLayoutImage(["Classroom"]));
  });

  it("returns undefined when no layout matches a known type", () => {
    expect(getVenueLayoutImage(["Legacy Hall"])).toBeUndefined();
  });

  it("returns undefined with no layout", () => {
    expect(getVenueLayoutImage([])).toBeUndefined();
  });
});
