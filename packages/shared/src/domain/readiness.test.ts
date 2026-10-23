import { describe, expect, it } from "vitest";

import {
  deriveEquipmentArrangementOverallStatus,
  deriveEquipmentRequirementReadinessStatus,
  deriveVenueArrangementOverallStatus,
  deriveVenueBookingReadinessStatus,
  isEventReady,
  READINESS_STATUS_LABELS,
} from "./readiness";

describe("deriveVenueBookingReadinessStatus", () => {
  // AC02/AC07: only Approved, unflagged, undisrupted is Complete.
  it("is Complete when approved, unflagged and undisrupted", () => {
    expect(
      deriveVenueBookingReadinessStatus({ status: "approved", needsReview: false, disrupted: false }),
    ).toBe("complete");
  });

  it("is Pending for a Pending request", () => {
    expect(deriveVenueBookingReadinessStatus({ status: "pending", needsReview: false, disrupted: false })).toBe(
      "pending",
    );
  });

  // AC07: a tentative hold never counts as complete.
  it("is Pending for an active (tentative) hold, never Complete", () => {
    expect(deriveVenueBookingReadinessStatus({ status: "on_hold", needsReview: false, disrupted: false })).toBe(
      "pending",
    );
  });

  // AC02: a flagged Approved booking is Needs Review.
  it("is Needs Review when approved but flagged", () => {
    expect(deriveVenueBookingReadinessStatus({ status: "approved", needsReview: true, disrupted: false })).toBe(
      "needs_review",
    );
  });

  it("is Needs Review when approved but disrupted", () => {
    expect(deriveVenueBookingReadinessStatus({ status: "approved", needsReview: false, disrupted: true })).toBe(
      "needs_review",
    );
  });
});

describe("deriveVenueArrangementOverallStatus", () => {
  it("is Needs Review when any active booking is", () => {
    expect(
      deriveVenueArrangementOverallStatus([
        { isMainVenue: true, status: "complete" },
        { isMainVenue: false, status: "needs_review" },
      ]),
    ).toBe("needs_review");
  });

  it("is Pending with no main venue booking at all", () => {
    expect(deriveVenueArrangementOverallStatus([{ isMainVenue: false, status: "complete" }])).toBe("pending");
  });

  it("is Pending when the main venue isn't Complete", () => {
    expect(deriveVenueArrangementOverallStatus([{ isMainVenue: true, status: "pending" }])).toBe("pending");
  });

  // AC03: a cancelled non-main booking is never passed in at all, so a
  // Complete main venue with nothing else active is Complete.
  it("is Complete with only a Complete main venue", () => {
    expect(deriveVenueArrangementOverallStatus([{ isMainVenue: true, status: "complete" }])).toBe("complete");
  });

  it("is Pending when a non-main active booking isn't Complete", () => {
    expect(
      deriveVenueArrangementOverallStatus([
        { isMainVenue: true, status: "complete" },
        { isMainVenue: false, status: "pending" },
      ]),
    ).toBe("pending");
  });

  it("is Complete when the main venue and every other active booking are Complete", () => {
    expect(
      deriveVenueArrangementOverallStatus([
        { isMainVenue: true, status: "complete" },
        { isMainVenue: false, status: "complete" },
      ]),
    ).toBe("complete");
  });
});

describe("deriveEquipmentRequirementReadinessStatus", () => {
  it("maps arranged to Complete", () => {
    expect(deriveEquipmentRequirementReadinessStatus("arranged")).toBe("complete");
  });

  it("maps issue to Needs Review", () => {
    expect(deriveEquipmentRequirementReadinessStatus("issue")).toBe("needs_review");
  });

  it("maps not_started and in_progress to Pending", () => {
    expect(deriveEquipmentRequirementReadinessStatus("not_started")).toBe("pending");
    expect(deriveEquipmentRequirementReadinessStatus("in_progress")).toBe("pending");
  });
});

describe("deriveEquipmentArrangementOverallStatus", () => {
  it("is Not Required with no requirements and acknowledged", () => {
    expect(
      deriveEquipmentArrangementOverallStatus({
        requirementCount: 0,
        requirementsAcknowledged: true,
        anyIssue: false,
        allReservedInFull: false,
      }),
    ).toBe("not_required");
  });

  it("is Pending with no requirements and not acknowledged", () => {
    expect(
      deriveEquipmentArrangementOverallStatus({
        requirementCount: 0,
        requirementsAcknowledged: false,
        anyIssue: false,
        allReservedInFull: false,
      }),
    ).toBe("pending");
  });

  it("is Needs Review when any requirement is flagged Issue", () => {
    expect(
      deriveEquipmentArrangementOverallStatus({
        requirementCount: 2,
        requirementsAcknowledged: true,
        anyIssue: true,
        allReservedInFull: true,
      }),
    ).toBe("needs_review");
  });

  // AC03: "reserved" is a distinct fact from "arranged" — a hand-set
  // Arranged status without a full reservation still isn't Complete.
  it("is Pending when requirements exist but are not all reserved in full", () => {
    expect(
      deriveEquipmentArrangementOverallStatus({
        requirementCount: 1,
        requirementsAcknowledged: true,
        anyIssue: false,
        allReservedInFull: false,
      }),
    ).toBe("pending");
  });

  it("is Complete when every requirement is reserved in full", () => {
    expect(
      deriveEquipmentArrangementOverallStatus({
        requirementCount: 1,
        requirementsAcknowledged: true,
        anyIssue: false,
        allReservedInFull: true,
      }),
    ).toBe("complete");
  });
});

describe("isEventReady", () => {
  // Configure Event Registration AC07: unfinished registration blocks the safety check.
  it("is not ready while required registration is incomplete or over capacity", () => {
    expect(
      isEventReady({
        venueArrangementStatus: "complete",
        equipmentArrangementStatus: "complete",
        registrationReady: false,
      }),
    ).toBe(false);
  });

  it("is ready when venues are complete and equipment is complete", () => {
    expect(isEventReady({ venueArrangementStatus: "complete", equipmentArrangementStatus: "complete" })).toBe(
      true,
    );
  });

  it("is ready when venues are complete and equipment is not required", () => {
    expect(
      isEventReady({ venueArrangementStatus: "complete", equipmentArrangementStatus: "not_required" }),
    ).toBe(true);
  });

  it("is not ready when venues aren't complete", () => {
    expect(isEventReady({ venueArrangementStatus: "pending", equipmentArrangementStatus: "complete" })).toBe(
      false,
    );
  });

  it("is not ready when equipment is pending or needs review", () => {
    expect(isEventReady({ venueArrangementStatus: "complete", equipmentArrangementStatus: "pending" })).toBe(
      false,
    );
    expect(
      isEventReady({ venueArrangementStatus: "complete", equipmentArrangementStatus: "needs_review" }),
    ).toBe(false);
  });
});

it("labels every readiness status for display", () => {
  expect(READINESS_STATUS_LABELS).toEqual({
    complete: "Complete",
    pending: "Pending",
    needs_review: "Needs Review",
    not_required: "Not Required",
  });
});
