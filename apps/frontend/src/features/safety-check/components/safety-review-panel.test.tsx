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
  equipment: [{ requirementId: "r1", equipmentName: "Projector", quantity: 2, notes: "HDMI input" }],
  crowdMovementPlan: "Enter at gate A; leave by gates B and C.",
  equipmentPlacement: "Projector at the rear, cables taped.",
  emergencyAccess: "Four exits; assembly point at the car park.",
  restrictions: "No open flames.",
  emergencyAccessChecked: true,
  restrictionsChecked: true,
  crowdMovementChecked: true,
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
    expect(screen.getByText("Technical requirements: HDMI input")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // SPM-90: the coordinator's Venue step checks (ticked, with any details)
  // and the Equipment step's placement.
  it("shows each venue safety check as checked, with its details, and the equipment placement", () => {
    render(<SafetyReviewPanel details={details} />);

    const emergency = screen.getByText("Emergency access").parentElement!;
    expect(emergency).toHaveTextContent("Checked");
    expect(emergency).toHaveTextContent("Four exits; assembly point at the car park.");
    expect(screen.getByText("Known restrictions").parentElement).toHaveTextContent("CheckedNo open flames.");
    expect(screen.getByText("Crowd movement").parentElement).toHaveTextContent(
      "Enter at gate A; leave by gates B and C.",
    );
    expect(screen.getByText("Equipment placement").nextElementSibling).toHaveTextContent(
      "Projector at the rear, cables taped.",
    );
    expect(screen.queryByText("Not checked")).not.toBeInTheDocument();
    expect(screen.queryByText("Not provided")).not.toBeInTheDocument();
  });

  it("accepts a ticked check without details", () => {
    render(<SafetyReviewPanel details={{ ...details, restrictions: null }} />);

    expect(screen.getByText("Known restrictions").parentElement).toHaveTextContent(/^Known restrictionsChecked$/);
  });

  it("highlights unticked checks and missing equipment placement", () => {
    render(
      <SafetyReviewPanel
        details={{
          ...details,
          emergencyAccessChecked: false,
          restrictionsChecked: false,
          crowdMovementChecked: true,
          equipmentPlacement: null,
        }}
      />,
    );

    expect(screen.getAllByText("Not checked")).toHaveLength(2);
    expect(screen.getByText("Equipment placement").nextElementSibling).toHaveTextContent("Not provided");
  });

  it("doesn't ask for equipment placement when there is no equipment", () => {
    render(<SafetyReviewPanel details={{ ...details, equipment: [], equipmentPlacement: null }} />);

    expect(screen.queryByText("Equipment placement")).not.toBeInTheDocument();
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
          crowdMovementPlan: "Enter at gate A.",
          equipmentPlacement: "Stage left.",
          emergencyAccess: "Exits B and C.",
          restrictions: "None known.",
          emergencyAccessChecked: true,
          restrictionsChecked: true,
          crowdMovementChecked: true,
        }}
      />,
    );

    expect(screen.getByText("Capacity 100; no expected attendance recorded")).toBeInTheDocument();
    expect(screen.getAllByText("No information recorded").length).toBeGreaterThan(3);
    expect(screen.queryByText(/Technical requirements:/)).not.toBeInTheDocument();
  });

  it("shows empty states for no venue booking and no equipment", () => {
    render(<SafetyReviewPanel details={{ ...details, venues: [], equipment: [] }} />);

    expect(screen.getByText("No active venue booking for this event.")).toBeInTheDocument();
    expect(screen.getByText("No equipment required for this event.")).toBeInTheDocument();
  });
});
