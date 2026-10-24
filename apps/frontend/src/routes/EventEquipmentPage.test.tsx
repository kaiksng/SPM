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
  EVENT_COMPLETED_RELEASE_REASON: "The event was completed",
  listEquipmentArrangements: (...args: unknown[]) => listEquipmentArrangementsMock(...args),
}));
const loadEquipmentArrangementStatusesMock = vi.fn();
vi.mock("@/features/equipment/services/equipment-arrangement-status", () => ({
  loadEquipmentArrangementStatuses: (...args: unknown[]) => loadEquipmentArrangementStatusesMock(...args),
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
  releaseReason: null,
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
  loadEquipmentArrangementStatusesMock.mockReset().mockResolvedValue(new Map());
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
      releaseReason: "Venue has screens",
      history: [
        { id: 2, action: "reserved", details: { quantity: 2 }, actorName: "Tess Support", occurredAt: "2099-06-20T02:00:00.000Z" },
        { id: 3, action: "released", details: { quantity: 2, reason: "Venue has screens" }, actorName: "Tess Support", occurredAt: "2099-06-21T02:00:00.000Z" },
      ],
    }),
  ]);
});

describe("EventEquipmentPage (equipment arrangements)", () => {
  it("shows each requested item with what was reserved, by whom and when (SPM-32 AC01)", async () => {
    renderPage();

    const projector = (await screen.findByText("Projector × 3")).closest("li")!;
    expect(projector).toHaveTextContent("Reserved");
    expect(projector).toHaveTextContent(/3 reserved for .* by Tess Support on/);
  });

  it("flags a reservation that needs re-checking (SPM-32 AC04)", async () => {
    renderPage();

    const mic = (await screen.findByText("Wireless microphone × 10")).closest("li")!;
    expect(mic).toHaveTextContent("Needs re-check");
    expect(mic).toHaveTextContent("The event date or time changed");
  });

  it("shows an item that is not reserved yet, and keeps released reservations on record (SPM-32 AC05)", async () => {
    const user = userEvent.setup();
    renderPage();

    const current = (await screen.findByRole("heading", { name: "Arrangements" })).closest("section")!;
    const tv = within(current).getByText("TV / display monitor × 2").closest("li")!;
    expect(tv).toHaveTextContent("Not reserved yet");

    const released = screen.getByRole("heading", { name: "Released reservations" }).closest("section")!;
    expect(within(released).getByText("TV / display monitor × 2")).toHaveClass("line-through");
    await user.click(within(released).getByText("History (2)"));
    expect(within(released).getByText(/Released 2: Venue has screens/)).toBeInTheDocument();
  });

  // SPM-46 AC06: released because the event was completed, not cancelled.
  it("labels a reservation released on completion and keeps its details", async () => {
    loadEventDetailMock.mockResolvedValue({ ...(await loadEventDetailMock()), status: "completed" });
    listEquipmentArrangementsMock.mockResolvedValue([
      arrangement({
        status: "released",
        releasedAt: "2099-07-01T08:00:00.000Z",
        releaseReason: "The event was completed",
      }),
    ]);
    renderPage();

    const released = (await screen.findByRole("heading", { name: "Released reservations" })).closest("section")!;
    const name = within(released).getByText("Projector × 3");
    expect(name).not.toHaveClass("line-through");
    const item = name.closest("li")!;
    expect(item).toHaveTextContent("Released – event completed");
    expect(item).toHaveTextContent(/Reserved for .* by Tess Support/);
    expect(item).not.toHaveTextContent(/Cancelled/);
  });

  it("links back to the event and keeps the planning sidebar", async () => {
    renderPage();

    expect(await screen.findByRole("navigation", { name: "Event lifecycle" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to event/ })).toHaveAttribute("href", "/events/event-1");
  });
});

describe("EventEquipmentPage (SPM-28 arrangement status)", () => {
  const statuses = new Map([
    [
      "req-proj",
      {
        status: "issue",
        note: "One projector is faulty",
        updatedByName: "Lee Support",
        updatedAt: "2099-06-22T02:00:00.000Z",
        history: [
          { id: 1, status: "in_progress", note: null, updatedByName: "Tess Support", updatedAt: "2099-06-21T02:00:00.000Z" },
          { id: 2, status: "issue", note: "One projector is faulty", updatedByName: "Lee Support", updatedAt: "2099-06-22T02:00:00.000Z" },
        ],
      },
    ],
  ]);

  it("shows the assigned coordinator each item's status, note and history (AC02/AC03)", async () => {
    loadEventDetailMock.mockResolvedValue({
      ...(await loadEventDetailMock()),
      assignedCoordinatorId: "coordinator-1",
    });
    loadEquipmentArrangementStatusesMock.mockResolvedValue(statuses);
    renderPage();

    const projector = (await screen.findByText("Projector × 3")).closest("li")!;
    expect(loadEquipmentArrangementStatusesMock).toHaveBeenCalledWith(["event-1"]);
    expect(within(projector).getByText("Arrangement: Issue")).toBeInTheDocument();
    expect(within(projector).getByText(/One projector is faulty/, { selector: "p" })).toBeInTheDocument();
    expect(within(projector).getByText(/Updated by Lee Support/)).toBeInTheDocument();
    expect(within(projector).getByText("Arrangement history (2)")).toBeInTheDocument();

    // Nobody set these, so they follow the reservation: a flagged one is an issue,
    // and one whose reservation was released hasn't been started.
    const mic = screen.getByText("Wireless microphone × 10").closest("li")!;
    expect(within(mic).getByText(/Arrangement: Issue/)).toHaveTextContent("Arrangement: Issue (automatic)");
    const tv = screen.getAllByText("TV / display monitor × 2")[0]!.closest("li")!;
    expect(within(tv).getByText("Arrangement: Not started")).toBeInTheDocument();
    // Read-only here: updating happens on the Technical Support Staff page.
    expect(screen.queryByRole("button", { name: "Update arrangement" })).not.toBeInTheDocument();
  });

  it("still shows the reservations when the arrangement statuses can't be loaded", async () => {
    loadEventDetailMock.mockResolvedValue({
      ...(await loadEventDetailMock()),
      assignedCoordinatorId: "coordinator-1",
    });
    loadEquipmentArrangementStatusesMock.mockRejectedValue(new Error("We couldn't load the equipment arrangement statuses."));
    renderPage();

    const projector = (await screen.findByText("Projector × 3")).closest("li")!;
    expect(within(projector).getByText(/3 reserved for/)).toBeInTheDocument();
    expect(screen.queryByText(/^Arrangement:/)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("hides the status from anyone other than the assigned coordinator", async () => {
    loadEventDetailMock.mockResolvedValue({
      ...(await loadEventDetailMock()),
      assignedCoordinatorId: "coordinator-2",
    });
    loadEquipmentArrangementStatusesMock.mockResolvedValue(statuses);
    renderPage();

    expect(await screen.findByText("Projector × 3")).toBeInTheDocument();
    expect(screen.queryByText(/^Arrangement:/)).not.toBeInTheDocument();
  });
});
