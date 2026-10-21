import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { EventPlanningTimeline } from "./event-planning-timeline";

function renderTimeline(status: string, path = "/events/event-1") {
  return render(
    <MemoryRouter initialEntries={[path]}>
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

  // A coordinator still in Planning opens Safety Check to see whether they can
  // submit, so the link must not look disabled before the stage is reached.
  it("shows the Safety Check link as clickable before the stage is reached", () => {
    renderTimeline("planning");

    expect(screen.getByRole("link", { name: "Safety Check" })).not.toHaveClass("text-slate-400");
  });

  it("greys out only a stage with no page until it is reached", () => {
    renderTimeline("planning");

    expect(screen.getByText("Event Confirmed")).toHaveClass("text-slate-400");
  });

  it("highlights the page being viewed", () => {
    renderTimeline("planning", "/events/event-1/safety-check");

    expect(screen.getByRole("link", { name: "Safety Check" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Event Request" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Venue" })).not.toHaveAttribute("aria-current");
  });

  it("highlights a Planning sub-page being viewed", () => {
    renderTimeline("planning", "/events/event-1/equipment");

    expect(screen.getByRole("link", { name: "Equipment" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Safety Check" })).not.toHaveAttribute("aria-current");
  });
});
