import { describe, expect, it } from "vitest";

import { deriveVenueDisruptionState, VENUE_DISRUPTION_STATE_LABELS } from "./venue-disruption";

describe("deriveVenueDisruptionState", () => {
  // SPM-83: an uncleared disruption with no replacement needs one.
  it("is Replacement Required while the disruption is open", () => {
    expect(deriveVenueDisruptionState({ clearedAt: null, bookingActive: true })).toBe("replacement_required");
  });

  it("is Replacement Requested while a replacement is pending", () => {
    expect(
      deriveVenueDisruptionState({ clearedAt: null, bookingActive: true, replacementRequested: true }),
    ).toBe("replacement_requested");
  });

  it("is Resolved once the disruption is cleared", () => {
    expect(
      deriveVenueDisruptionState({ clearedAt: "2099-04-06T00:00:00.000Z", bookingActive: true }),
    ).toBe("resolved");
  });

  it("is Resolved when the disrupted booking is no longer active", () => {
    expect(
      deriveVenueDisruptionState({ clearedAt: null, bookingActive: false, replacementRequested: true }),
    ).toBe("resolved");
  });

  it("labels every state for display", () => {
    expect(VENUE_DISRUPTION_STATE_LABELS).toEqual({
      replacement_required: "Replacement Required",
      replacement_requested: "Replacement Requested",
      resolved: "Resolved",
    });
  });
});
