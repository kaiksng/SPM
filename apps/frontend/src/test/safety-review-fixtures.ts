import type { SafetyReviewHistoryRecord } from "@/features/safety-check/services/safety-review-history";

export const safetyReviewRecord: SafetyReviewHistoryRecord = {
  decisionId: 12, eventId: "event-1", title: "Alumni Homecoming Mixer",
  currentStatus: "confirmed", currentRound: 2, round: 1,
  submittedAt: "2099-04-01T01:00:00Z", coordinatorName: "Priya Patel",
  outcome: "changes_requested", reason: "Move the projector away from the exit.",
  reviewerName: "Sam Safety", decidedAt: "2099-04-02T01:00:00Z",
  flaggedBookingIds: [], flaggedRequirementIds: ["req-1"],
  venuesSnapshot: [{ bookingId: "booking-1", venueName: "Original Auditorium", isMainVenue: true }],
  equipmentSnapshot: [{ requirementId: "req-1", equipmentName: "Projector", quantity: 2 }],
  periodSnapshot: { startsAt: "2099-04-06T02:00:00Z", endsAt: "2099-04-06T04:00:00Z" },
  attendanceSnapshot: 120,
};
