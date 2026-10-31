import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listBrowseEventsMock = vi.fn();

const authState = {
  profile: { full_name: "Alex Attendee", role: "attendee" },
  user: { id: "attendee-1" },
};

vi.mock("@/context/auth-context", () => ({
  useAuth: () => authState,
}));

vi.mock("@/hooks/use-page-title", () => ({ usePageTitle: vi.fn() }));
vi.mock("@/features/event-banners/services/event-banners", () => ({
  eventBannerUrl: (path: string | null) => (path ? `https://storage.test/${path}` : null),
  uploadEventBanner: vi.fn(),
  removeEventBanner: vi.fn(),
}));

vi.mock("@/features/registrations/services/browse-events", () => ({
  listBrowseEvents: (...args: unknown[]) => listBrowseEventsMock(...args),
}));

import { BrowseEventsPage } from "./BrowseEventsPage";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/browse-events"]}>
      <BrowseEventsPage />
    </MemoryRouter>,
  );
}

const openEvent = {
  id: "event-1",
  title: "AI Innovation Summit",
  startsAt: "2026-11-12T02:00:00Z",
  endsAt: "2026-11-12T08:00:00Z",
  location: "Auditorium",
  opensAt: null,
  closesAt: null,
  capacity: 50,
  registeredCount: 32,
  state: "open" as const,
};

const fullEvent = {
  id: "event-2",
  title: "Career Fair 2026",
  startsAt: "2026-11-20T01:00:00Z",
  endsAt: "2026-11-20T09:00:00Z",
  location: "Pan Pacific Hotel",
  opensAt: null,
  closesAt: null,
  capacity: 200,
  registeredCount: 200,
  state: "full" as const,
};

describe("BrowseEventsPage", () => {
  beforeEach(() => {
    authState.profile.role = "attendee";
    listBrowseEventsMock.mockReset().mockResolvedValue([]);
  });

  // Event banner: each card shows the organiser's banner, or a placeholder.
  it("shows each event's banner, or a placeholder when it has none", async () => {
    listBrowseEventsMock.mockResolvedValue([
      { ...openEvent, bannerPath: "org-1/summit.png" },
      { ...fullEvent, bannerPath: null },
    ]);
    renderPage();

    const summit = (await screen.findByText("AI Innovation Summit")).closest("a")!;
    expect(summit.querySelector("img")).toHaveAttribute("src", "https://storage.test/org-1/summit.png");
    const fair = screen.getByText("Career Fair 2026").closest("a")!;
    expect(fair.querySelector("img")).toBeNull();
    expect(within(fair).getByTestId("event-banner-placeholder")).toBeInTheDocument();
  });

  // SPM-49 AC01: a signed-in attendee sees the attendee-facing events page.
  it("shows an attendee the attendee workspace", async () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Browse events" })).toBeInTheDocument();
    expect(screen.getByText("Attendee workspace")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "No events yet" })).toBeInTheDocument();
  });

  it("lists confirmed events once loaded", async () => {
    listBrowseEventsMock.mockResolvedValue([openEvent, fullEvent]);

    renderPage();

    const openCard = (await screen.findByText("AI Innovation Summit")).closest("a")!;
    const fullCard = screen.getByText("Career Fair 2026").closest("a")!;
    expect(within(openCard).getByText("Register")).toBeInTheDocument();
    expect(within(fullCard).getAllByText("Full").length).toBeGreaterThan(0);
  });

  it("filters the list by status", async () => {
    listBrowseEventsMock.mockResolvedValue([openEvent, fullEvent]);
    const user = userEvent.setup();

    renderPage();
    await screen.findByText("AI Innovation Summit");

    await user.click(screen.getByRole("radio", { name: "Open" }));

    expect(screen.getByText("AI Innovation Summit")).toBeInTheDocument();
    expect(screen.queryByText("Career Fair 2026")).not.toBeInTheDocument();
  });

  // SPM-49 AC02: the attendee page carries no internal planning details.
  it("shows no internal planning information", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "No events yet" });

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
