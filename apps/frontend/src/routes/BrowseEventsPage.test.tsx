import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = { profile: { full_name: "Alex Attendee", role: "attendee" } };

vi.mock("@/context/auth-context", () => ({
  useAuth: () => authState,
}));

vi.mock("@/hooks/use-page-title", () => ({ usePageTitle: vi.fn() }));

import { BrowseEventsPage } from "./BrowseEventsPage";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/browse-events"]}>
      <BrowseEventsPage />
    </MemoryRouter>,
  );
}

describe("BrowseEventsPage", () => {
  beforeEach(() => {
    authState.profile.role = "attendee";
  });

  // SPM-49 AC01: a signed-in attendee sees the attendee-facing events page.
  it("shows an attendee the attendee workspace", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Browse events" })).toBeInTheDocument();
    expect(screen.getByText("Attendee workspace")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No events yet" })).toBeInTheDocument();
  });

  // SPM-49 AC02: the attendee page carries no internal planning details.
  it("shows no internal planning information", () => {
    renderPage();

    for (const internal of [/coordinator/i, /organiser/i, /venue booking/i, /equipment/i, /clarification/i]) {
      expect(screen.queryByText(internal)).not.toBeInTheDocument();
    }
  });

  it("is not shown to an internal role", () => {
    authState.profile.role = "event_coordinator";

    renderPage();

    expect(screen.getByText("Access denied")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Browse events" })).not.toBeInTheDocument();
  });
});
