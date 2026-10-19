import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { EventPlanningTimeline } from "./event-planning-timeline";

function renderTimeline(status: string) {
  return render(
    <MemoryRouter>
      <EventPlanningTimeline status={status} eventId="event-1" />
    </MemoryRouter>,
  );
}

describe("EventPlanningTimeline", () => {
  // A single Safety Check stage link, reached or not, so the page is
  // reachable before and after submitting — not duplicated as a Planning
  // sub-nav item too.
  it("links to the Safety Check page exactly once", () => {
    renderTimeline("planning");

    const links = screen.getAllByRole("link", { name: "Safety Check" });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/events/event-1/safety-check");
  });

  it("still links to it once Pending Safety Check is reached", () => {
    renderTimeline("pending_safety_check");

    expect(screen.getByRole("link", { name: "Safety Check" })).toHaveAttribute(
      "href",
      "/events/event-1/safety-check",
    );
  });
});
