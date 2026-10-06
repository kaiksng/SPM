import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = {
  profile: { full_name: "Joyce Coordinator", role: "event_coordinator" },
  user: { id: "coordinator-1" },
  loading: false,
  session: {},
};

vi.mock("@/context/auth-context", () => ({ useAuth: () => authState }));
vi.mock("@/hooks/use-page-title", () => ({ usePageTitle: vi.fn() }));

const loadEventDetailMock = vi.fn();
const listEquipmentArrangementsMock = vi.fn();
vi.mock("@/features/event-requests/services/event-details", () => ({
  loadEventDetail: (...args: unknown[]) => loadEventDetailMock(...args),
}));
vi.mock("@/features/event-requests/services/equipment-arrangements", () => ({
  listEquipmentArrangements: (...args: unknown[]) => listEquipmentArrangementsMock(...args),
}));

import { EventEquipmentPage } from "./EventEquipmentPage";

const requirement = (id: string, name: string, quantity: number) => ({
  id,
  equipmentItemId: `item-${id}`,
  equipmentName: name,
  category: "Visual",
  quantity,
  requiredFrom: "2099-07-01T01:00:00.000Z",
  requiredUntil: "2099-07-01T06:00:00.000Z",
  technicalRequirements: null,
});

const arrangement = (overrides: Record<string, unknown>) => ({
  id: "res",
  requirementId: "req-proj",
  equipmentName: "Projector",
  quantity: 3,
  startsAt: "2099-07-01T01:00:00.000Z",
  endsAt: "2099-07-01T06:00:00.000Z",
  status: "reserved",
  reservedByName: "Tess Support",
  reservedAt: "2099-06-20T02:00:00.000Z",
  needsRecheck: false,
  recheckReason: null,
  releasedAt: null,
  history: [
    { id: 1, action: "reserved", details: { quantity: 3 }, actorName: "Tess Support", occurredAt: "2099-06-20T02:00:00.000Z" },
  ],
  ...overrides,
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/events/event-1/equipment"]}>
      <Routes>
        <Route path="events/:eventId/equipment" element={<EventEquipmentPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  loadEventDetailMock.mockReset().mockResolvedValue({
    id: "event-1",
    title: "Spring Expo",
    status: "planning",
    equipment: [
      requirement("req-proj", "Projector", 3),
      requirement("req-mic", "Wireless microphone", 10),
      requirement("req-tv", "TV / display monitor", 2),
    ],
  });
  listEquipmentArrangementsMock.mockReset().mockResolvedValue([
    arrangement({}),
    arrangement({
      id: "res-mic",
      requirementId: "req-mic",
      equipmentName: "Wireless microphone",
      quantity: 10,
      needsRecheck: true,
      recheckReason: "The event date or time changed",
    }),
    arrangement({
      id: "res-old",
      requirementId: "req-tv",
      equipmentName: "TV / display monitor",
      quantity: 2,
      status: "released",
      releasedAt: "2099-06-21T02:00:00.000Z",
      history: [
        { id: 2, action: "reserved", details: { quantity: 2 }, actorName: "Tess Support", occurredAt: "2099-06-20T02:00:00.000Z" },
        { id: 3, action: "released", details: { quantity: 2, reason: "Venue has screens" }, actorName: "Tess Support", occurredAt: "2099-06-21T02:00:00.000Z" },
      ],
    }),
  ]);
});

describe("EventEquipmentPage (equipment arrangements)", () => {
  it("shows each requested item with what was reserved, by whom and when (AC1)", async () => {
    renderPage();

    const projector = (await screen.findByText("Projector × 3")).closest("li")!;
    expect(projector).toHaveTextContent("Reserved");
    expect(projector).toHaveTextContent(/3 reserved for .* by Tess Support on/);
  });

  it("flags a reservation that needs re-checking (AC4)", async () => {
    renderPage();

    const mic = (await screen.findByText("Wireless microphone × 10")).closest("li")!;
    expect(mic).toHaveTextContent("Needs re-check");
    expect(mic).toHaveTextContent("The event date or time changed");
  });

  it("shows an item that is not reserved yet, and keeps released reservations on record (AC5)", async () => {
    const user = userEvent.setup();
    renderPage();

    const current = (await screen.findByRole("heading", { name: "Arrangements" })).closest("section")!;
    const tv = within(current).getByText("TV / display monitor × 2").closest("li")!;
    expect(tv).toHaveTextContent("Not reserved yet");

    const released = screen.getByRole("heading", { name: "Released reservations" }).closest("section")!;
    await user.click(within(released).getByText("History (2)"));
    expect(within(released).getByText(/Released 2: Venue has screens/)).toBeInTheDocument();
  });

  it("links back to the event and keeps the planning sidebar", async () => {
    renderPage();

    expect(await screen.findByRole("navigation", { name: "Event lifecycle" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to event/ })).toHaveAttribute("href", "/events/event-1");
  });
});
