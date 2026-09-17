import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { EventHistoryButton } from "./event-history-link";

describe("EventHistoryButton", () => {
  it("links to the event's history page", () => {
    render(
      <MemoryRouter>
        <EventHistoryButton eventId="event-1" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "View change history" })).toHaveAttribute(
      "href",
      "/events/event-1/history",
    );
  });
});
