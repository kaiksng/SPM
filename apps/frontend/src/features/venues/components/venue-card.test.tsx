import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import type { VenueSummary } from "@/features/venues/services/venues";
import { getVenueLayoutImage } from "@/features/venues/utils/venue-layout-image";

// venue-card only imports a type from the venues service; mock the client so
// nothing can reach a real Supabase project.
vi.mock("@/lib/supabase-client", () => ({ supabase: {} }));

import { VenueCard } from "./venue-card";

const venue: VenueSummary = {
  id: "venue-1",
  name: "Auditorium",
  location: "1 Beach Road",
  areaTags: ["Bugis"],
  capacity: 250,
  operatingHours: [{ days: ["mon"], opensAt: "08:00", closesAt: "18:00" }],
  description: null,
  accessibilityNotes: null,
  facilities: ["Projector"],
  layouts: ["Theatre"],
  imageUrl: null,
  updatedAt: "2026-09-26T06:11:00.000Z",
  updatedByName: "keith",
  needsReviewCount: 0,
  setupTimeMinutes: 30,
  turnaroundTimeMinutes: 45,
};

function renderCard(overrides: Partial<VenueSummary> = {}) {
  const result = render(
    <MemoryRouter>
      <VenueCard venue={{ ...venue, ...overrides }} canManageVenues={false} />
    </MemoryRouter>,
  );
  return {
    ...result,
    // The card's photo is decorative (alt=""), which gives it an implicit
    // ARIA role of "presentation", not "img" -- queried by tag instead.
    image: () => result.container.querySelector("img"),
  };
}

describe("VenueCard", () => {
  // SPM-86 AC03: saved setup and turnaround times are shown in the catalogue.
  it("shows the venue's setup and turnaround time", () => {
    renderCard();

    expect(screen.getByText("Setup 30 min · Turnaround 45 min")).toBeInTheDocument();
  });

  // SPM-86 AC01: a venue that never had values configured reads as 0 minutes.
  it("shows 0 minutes when no setup or turnaround time is set", () => {
    renderCard({ setupTimeMinutes: undefined, turnaroundTimeMinutes: undefined });

    expect(screen.getByText("Setup 0 min · Turnaround 0 min")).toBeInTheDocument();
  });

  it("links to the venue's details page", () => {
    renderCard();

    expect(screen.getByRole("link")).toHaveAttribute("href", "/venues/venue-1");
  });

  it("shows the venue's layout photo", () => {
    const { image } = renderCard({ layouts: ["Classroom"] });

    expect(image()).toHaveAttribute("src", getVenueLayoutImage(["Classroom"]));
  });
});
