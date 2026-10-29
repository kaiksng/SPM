import type { SafetyReviewDetails } from "@spm/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SafetyReviewPanel } from "./safety-review-panel";

const venue = {
  bookingId: "b1",
  venueName: "Main Auditorium",
  location: "Block A",
  label: "Main programme",
  isMainVenue: true,
  capacity: 100,
  headcount: 80,
  underCapacity: false,
  layouts: ["Theatre"],
  requestedLayoutNotes: "Stage on the left",
  requestedAccessibilityNotes: null,
  venueAccessibilityNotes: "Step-free entrance",
  venueDescription: "Two fire exits at the rear.",
};

const details: SafetyReviewDetails = {
  expectedAttendance: 80,
  accessibilityNeeds: "Two wheelchair spaces",
  layoutPreference: null,
  venues: [venue],
  equipment: [{ requirementId: "r1", equipmentName: "Projector", quantity: 2, notes: "Rear of hall" }],
};

describe("SafetyReviewPanel", () => {
  // SPM-90 AC02: attendance vs capacity, layouts, accessibility, equipment, venue notes.
  it("shows attendance against capacity and the venue's review facts", () => {
    render(<SafetyReviewPanel details={details} />);

    expect(screen.getByText("Main Auditorium")).toBeInTheDocument();
    expect(screen.getByText("Expected 80 of capacity 100")).toBeInTheDocument();
    expect(screen.getByText("Theatre")).toBeInTheDocument();
    expect(screen.getByText("Step-free entrance")).toBeInTheDocument();
    expect(screen.getByText("Two wheelchair spaces")).toBeInTheDocument();
    expect(screen.getByText("Two fire exits at the rear.")).toBeInTheDocument();
    expect(screen.getByText("Projector × 2")).toBeInTheDocument();
    expect(screen.getByText("Placement notes: Rear of hall")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // SPM-90 AC03: a venue smaller than its expected attendance is highlighted.
  it("highlights a venue whose capacity is below the expected attendance", () => {
    render(
      <SafetyReviewPanel
        details={{ ...details, venues: [{ ...venue, capacity: 50, headcount: 80, underCapacity: true }] }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Expected 80 of capacity 50 — exceeds capacity by 30");
  });

  // SPM-90 AC02: where nothing is recorded, the page says so.
  it("says so when information is missing or nothing is booked", () => {
    render(
      <SafetyReviewPanel
        details={{
          expectedAttendance: null,
          accessibilityNeeds: null,
          layoutPreference: null,
          venues: [{ ...venue, headcount: null, layouts: [], venueDescription: null, venueAccessibilityNotes: " " }],
          equipment: [{ requirementId: "r2", equipmentName: "Speaker", quantity: 1, notes: null }],
        }}
      />,
    );

    expect(screen.getByText("Capacity 100; no expected attendance recorded")).toBeInTheDocument();
    expect(screen.getAllByText("No information recorded").length).toBeGreaterThan(3);
    expect(screen.getByText("Placement notes: No information recorded")).toBeInTheDocument();
  });

  it("shows empty states for no venue booking and no equipment", () => {
    render(<SafetyReviewPanel details={{ ...details, venues: [], equipment: [] }} />);

    expect(screen.getByText("No active venue booking for this event.")).toBeInTheDocument();
    expect(screen.getByText("No equipment required for this event.")).toBeInTheDocument();
  });
});
