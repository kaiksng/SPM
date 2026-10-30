import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const authState = {
  profile: { full_name: "Cory Coordinator", role: "event_coordinator" },
  user: { id: "coordinator-1" },
  loading: false,
  session: {},
};

vi.mock("@/context/auth-context", () => ({ useAuth: () => authState }));
vi.mock("@/hooks/use-page-title", () => ({ usePageTitle: vi.fn() }));

const listVenuesMock = vi.fn();
vi.mock("@/features/venues/services/venues", () => ({
  listVenues: () => listVenuesMock(),
}));

// useRoomLayoutOptions reads custom layouts straight from supabase.
vi.mock("@/lib/supabase-client", () => ({
  supabase: { from: () => queryBuilder({ data: [], error: null }) },
}));

import { VenuesPage } from "./VenuesPage";

const operatingHours = [{ days: ["Mon"], opensAt: "09:00", closesAt: "17:00" }];

const venue = (overrides: Record<string, unknown>) => ({
  id: "venue-default",
  name: "Default Hall",
  location: "123 Main St",
  areaTags: [] as string[],
  capacity: 50,
  operatingHours,
  description: null,
  accessibilityNotes: null,
  facilities: [] as string[],
  layouts: [] as string[],
  updatedAt: "2026-01-01T00:00:00Z",
  updatedByName: null,
  needsReviewCount: 0,
  ...overrides,
});

const auditorium = venue({
  id: "venue-auditorium",
  name: "Grand Auditorium",
  areaTags: ["Orchard"],
  capacity: 300,
  facilities: ["Air conditioning", "Parking"],
  layouts: ["Theatre"],
  accessibilityNotes: "Wheelchair accessible, hearing loop",
});
const boardroom = venue({
  id: "venue-boardroom",
  name: "Harbour Boardroom",
  areaTags: ["Marina Bay"],
  capacity: 20,
  facilities: ["Pantry"],
  layouts: ["Boardroom"],
});

function renderPage(initialEntries: string[] = ["/venues"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <VenuesPage />
    </MemoryRouter>,
  );
}

let lastSearch = "";
function LocationSpy() {
  lastSearch = useLocation().search;
  return null;
}

/** Renders VenuesPage with a spy that records its URL as filters/search change. */
function renderPageWithLocationSpy() {
  lastSearch = "";
  return render(
    <MemoryRouter initialEntries={["/venues"]}>
      <Routes>
        <Route
          path="/venues"
          element={
            <>
              <VenuesPage />
              <LocationSpy />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

// Filters is now an always-visible section (no disclosure to open); kept so
// call sites below don't need touching.
async function openFilters(_user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("region", { name: "Filters" });
}

beforeEach(() => {
  authState.profile = { full_name: "Cory Coordinator", role: "event_coordinator" };
  listVenuesMock.mockReset().mockResolvedValue([auditorium, boardroom]);
});

describe("VenuesPage filters", () => {
  it("shows the full catalogue with no filters or search applied", async () => {
    renderPage();

    expect(await screen.findByText("Grand Auditorium")).toBeInTheDocument();
    expect(screen.getByText("Harbour Boardroom")).toBeInTheDocument();
  });

  it("narrows the list by a single filter category", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Grand Auditorium");

    await openFilters(user);
    await user.type(screen.getByLabelText("Minimum capacity"), "100");

    expect(screen.getByText("Grand Auditorium")).toBeInTheDocument();
    expect(screen.queryByText("Harbour Boardroom")).not.toBeInTheDocument();
  });

  it("applies filters across categories together (AND)", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Grand Auditorium");

    await openFilters(user);
    await user.selectOptions(screen.getByLabelText("Area"), "Orchard");
    await user.type(screen.getByLabelText("Minimum capacity"), "1000");

    // Orchard matches the auditorium, but the capacity filter excludes it too.
    expect(screen.queryByText("Grand Auditorium")).not.toBeInTheDocument();
    expect(screen.queryByText("Harbour Boardroom")).not.toBeInTheDocument();
    expect(await screen.findByText("No matching venues")).toBeInTheDocument();
  });

  it("combines an active filter with the search box", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Grand Auditorium");

    await openFilters(user);
    await user.selectOptions(screen.getByLabelText("Area"), "Orchard");
    await user.type(screen.getByLabelText("Search venues"), "Harbour");

    // Harbour Boardroom matches the search but not the area filter.
    expect(screen.queryByText("Grand Auditorium")).not.toBeInTheDocument();
    expect(screen.queryByText("Harbour Boardroom")).not.toBeInTheDocument();
    expect(await screen.findByText("No matching venues")).toBeInTheDocument();
  });

  it("shows a distinct no-matching-venues state, not the empty catalogue state", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Grand Auditorium");

    await openFilters(user);
    await user.type(screen.getByLabelText("Minimum capacity"), "99999");

    expect(await screen.findByText("No matching venues")).toBeInTheDocument();
    expect(screen.queryByText("No venues yet")).not.toBeInTheDocument();
  });

  it("clears filters and restores the full catalogue, respecting the search term", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Grand Auditorium");

    await openFilters(user);
    await user.type(screen.getByLabelText("Minimum capacity"), "99999");
    expect(await screen.findByText("No matching venues")).toBeInTheDocument();

    const noMatch = screen.getByText("No matching venues").closest("section")!;
    await user.click(within(noMatch).getByRole("button", { name: "Clear filters" }));

    expect(await screen.findByText("Grand Auditorium")).toBeInTheDocument();
    expect(screen.getByText("Harbour Boardroom")).toBeInTheDocument();
  });

  it("shows the true empty state when the catalogue itself has no venues", async () => {
    listVenuesMock.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText("No venues yet")).toBeInTheDocument();
  });

  it("narrows by facility, requiring every selected facility to be present", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Grand Auditorium");

    await openFilters(user);
    await user.click(screen.getByRole("button", { name: /Select facilities/ }));
    await user.click(await screen.findByLabelText("Parking"));

    expect(screen.getByText("Grand Auditorium")).toBeInTheDocument();
    expect(screen.queryByText("Harbour Boardroom")).not.toBeInTheDocument();
  });

  it("narrows by an accessibility keyword", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Grand Auditorium");

    await openFilters(user);
    await user.type(screen.getByLabelText("Accessibility"), "wheelchair");

    expect(screen.getByText("Grand Auditorium")).toBeInTheDocument();
    expect(screen.queryByText("Harbour Boardroom")).not.toBeInTheDocument();
  });

  it("narrows by layout type", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Grand Auditorium");

    await openFilters(user);
    await user.click(screen.getByRole("radio", { name: "Boardroom" }));

    expect(screen.queryByText("Grand Auditorium")).not.toBeInTheDocument();
    expect(screen.getByText("Harbour Boardroom")).toBeInTheDocument();
  });

  it("shows a removable chip for each active filter", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Grand Auditorium");

    await openFilters(user);
    await user.click(screen.getByRole("radio", { name: "Boardroom" }));

    const chip = await screen.findByRole("button", { name: "Remove Boardroom filter" });
    expect(chip).toBeInTheDocument();
    await user.click(chip);

    expect(await screen.findByText("Grand Auditorium")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove Boardroom filter" }),
    ).not.toBeInTheDocument();
  });

  it("keeps active filters and search in the URL so going back restores them", async () => {
    const user = userEvent.setup();
    renderPageWithLocationSpy();
    await screen.findByText("Grand Auditorium");

    await openFilters(user);
    await user.selectOptions(screen.getByLabelText("Area"), "Orchard");
    await user.type(screen.getByLabelText("Search venues"), "Hall");
    await user.type(screen.getByLabelText("Accessibility"), "wheelchair");

    expect(lastSearch).toContain("area=Orchard");
    expect(lastSearch).toContain("q=Hall");
    expect(lastSearch).toContain("accessibility=wheelchair");
  });

  it("restores filters and search from the URL on mount (as when navigating back)", async () => {
    renderPage(["/venues?area=Orchard&minCapacity=100&q=Grand"]);
    await screen.findByText("Grand Auditorium");

    expect(screen.queryByText("Harbour Boardroom")).not.toBeInTheDocument();
    const user = userEvent.setup();
    await openFilters(user);
    expect(screen.getByLabelText("Area")).toHaveValue("Orchard");
    expect(screen.getByLabelText("Minimum capacity")).toHaveValue(100);
    expect(screen.getByLabelText("Search venues")).toHaveValue("Grand");
  });

  it("shows a removable chip for an accessibility filter", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Grand Auditorium");

    await openFilters(user);
    await user.type(screen.getByLabelText("Accessibility"), "wheelchair");

    const chip = await screen.findByRole("button", { name: "Remove wheelchair filter" });
    expect(chip).toBeInTheDocument();
    await user.click(chip);

    expect(await screen.findByText("Harbour Boardroom")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove wheelchair filter" }),
    ).not.toBeInTheDocument();
  });
});
