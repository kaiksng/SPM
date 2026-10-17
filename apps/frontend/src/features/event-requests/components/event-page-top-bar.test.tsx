import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
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

  // The Events list keeps its search/filter state in its own URL; a plain
  // Link to a bare "/events" would discard it, so "Back to events" instead
  // goes back in browser history to restore that exact URL.
  it("goes back in history instead of linking to backTo when useHistoryBack is set", async () => {
    const user = userEvent.setup();
    let lastSearch = "";
    function LocationSpy() {
      lastSearch = useLocation().search;
      return null;
    }

    render(
      <MemoryRouter initialEntries={["/events?status=planning", "/events/event-1"]} initialIndex={1}>
        <Routes>
          <Route
            path="/events"
            element={
              <>
                <LocationSpy />
              </>
            }
          />
          <Route
            path="/events/event-1"
            element={<EventPageTopBar backTo="/events" backLabel="Back to events" eventId="event-1" useHistoryBack />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByRole("link", { name: "Back to events" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to events" }));

    expect(lastSearch).toBe("?status=planning");
  });
});
