import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { EventPageTopBar } from "./event-page-top-bar";

describe("EventPageTopBar", () => {
  it("offers the way back and the event's change history together", () => {
    render(
      <MemoryRouter>
        <EventPageTopBar backTo="/events/event-1" backLabel="Back to event" eventId="event-1" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Back to event" })).toHaveAttribute("href", "/events/event-1");
    expect(screen.getByRole("link", { name: "Change history" })).toHaveAttribute(
      "href",
      "/events/event-1/history",
    );
  });

  it("leaves out the history link when there is no event yet", () => {
    render(
      <MemoryRouter>
        <EventPageTopBar backTo="/events" backLabel="Back to events" eventId={undefined} />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("link", { name: "Change history" })).not.toBeInTheDocument();
  });
});
