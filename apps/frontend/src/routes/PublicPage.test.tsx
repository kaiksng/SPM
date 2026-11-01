import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState: { user: { id: string } | null; profile: { role: string } | null } = { user: null, profile: null };
vi.mock("@/context/auth-context", () => ({ useAuth: () => authState }));
vi.mock("@/hooks/use-page-title", () => ({ usePageTitle: vi.fn() }));
vi.mock("@/features/event-banners/services/event-banners", () => ({
  eventBannerUrl: (path: string | null) => (path ? `https://storage.test/${path}` : null),
}));
const listPublicEventsMock = vi.fn();
vi.mock("@/features/public-events/services/public-events", () => ({
  listPublicEvents: (...args: unknown[]) => listPublicEventsMock(...args),
}));

import { PublicPage } from "./PublicPage";

const summit = {
  id: "event-1",
  title: "AI Summit",
  startsAt: "2099-07-01T02:00:00Z",
  endsAt: "2099-07-01T06:00:00Z",
  location: "Auditorium",
  bannerPath: "org-1/summit.png",
  opensAt: null,
  registration: "open",
};

function renderPage() {
  return render(
    <MemoryRouter>
      <PublicPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authState.user = null;
  authState.profile = null;
  listPublicEventsMock.mockReset().mockResolvedValue([
    summit,
    { ...summit, id: "event-2", title: "Career Fair", bannerPath: null, location: null, registration: "not_open", opensAt: "2099-06-10T00:00:00Z" },
    { ...summit, id: "event-3", title: "Hack Night", registration: "full" },
    { ...summit, id: "event-4", title: "Movie Night", registration: "not_required" },
    { ...summit, id: "event-5", title: "Updating Gala", registration: "being_updated" },
  ]);
});

describe("PublicPage upcoming events", () => {
  it("shows upcoming events with their banner, date, location and registration", async () => {
    renderPage();

    const card = (await screen.findByText("AI Summit")).closest("a")!;
    expect(card.querySelector("img")).toHaveAttribute("src", "https://storage.test/org-1/summit.png");
    expect(card).toHaveTextContent("Auditorium");
    expect(card).toHaveTextContent("Registration open");
    expect(screen.getByText("Career Fair").closest("a")).toHaveTextContent("Opens 10 Jun");
    expect(screen.getByText("Hack Night").closest("a")).toHaveTextContent("Full");
    expect(screen.getByText("Movie Night").closest("a")).toHaveTextContent("No registration needed");
    expect(screen.getByText("Updating Gala").closest("a")).toHaveTextContent("Venue to be confirmed");
  });

  it("sends a signed-out visitor to sign in, then to the event", async () => {
    renderPage();

    expect((await screen.findByText("AI Summit")).closest("a")).toHaveAttribute(
      "href",
      "/login?next=%2Fbrowse-events%2Fevent-1",
    );
    expect(screen.getByRole("link", { name: /See all/ })).toHaveAttribute("href", "/login?next=%2Fbrowse-events");
  });

  it("takes a signed-in attendee straight to the event", async () => {
    authState.user = { id: "attendee-1" };
    authState.profile = { role: "attendee" };
    renderPage();

    expect((await screen.findByText("AI Summit")).closest("a")).toHaveAttribute("href", "/browse-events/event-1");
  });

  it("takes other signed-in roles to their own workspace", async () => {
    authState.user = { id: "coordinator-1" };
    authState.profile = { role: "event_coordinator" };
    renderPage();

    expect((await screen.findByText("AI Summit")).closest("a")).not.toHaveAttribute("href", "/browse-events/event-1");
  });

  it("says when there are no upcoming events", async () => {
    listPublicEventsMock.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText("No upcoming events yet")).toBeInTheDocument();
  });

  it("says when events can't be loaded", async () => {
    listPublicEventsMock.mockRejectedValue(new Error("We couldn't load upcoming events."));
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load upcoming events.");
    expect(within(document.body).queryByText("AI Summit")).not.toBeInTheDocument();
  });
});
