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
const saveEventEquipmentMock = vi.fn();
vi.mock("@/features/event-requests/services/coordinator-event-edit", async () => ({
  ...(await vi.importActual<typeof import("@/features/event-requests/utils/local-date-time")>(
    "@/features/event-requests/utils/local-date-time",
  )),
  saveEventEquipment: (...args: unknown[]) => saveEventEquipmentMock(...args),
}));
// The real toEquipmentFormValues is kept; only the catalogue load is faked.
vi.mock("@/lib/supabase-client", () => ({ supabase: {} }));
vi.mock("@/features/event-requests/services/equipment", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/event-requests/services/equipment")>()),
  loadEquipmentCatalogue: vi.fn().mockResolvedValue([
    { id: "item-req-proj", name: "Projector", category: "Visual", retired: false },
    { id: "item-mic", name: "Wired microphone", category: "Audio", retired: false },
  ]),
}));

import { localDateTime } from "@/features/event-requests/utils/local-date-time";

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

  describe("requesting and changing equipment from this page", () => {
    // The assigned coordinator's Planning event, with its own period.
    async function asAssignedCoordinator(overrides: Record<string, unknown> = {}) {
      loadEventDetailMock.mockResolvedValue({
        ...(await loadEventDetailMock()),
        assignedCoordinatorId: "coordinator-1",
        startsAt: "2099-07-01T02:00:00.000Z",
        endsAt: "2099-07-01T04:00:00.000Z",
        ...overrides,
      });
    }

    // Runs the change the page sent, the way saveEventEquipment applies it.
    function applySavedChange(current: Array<{ id: string; quantity: string }>) {
      const change = saveEventEquipmentMock.mock.calls[0]![1] as (
        equipment: Array<{ id: string; quantity: string }>,
      ) => Array<Record<string, string>>;
      return change(current);
    }

    beforeEach(() => {
      saveEventEquipmentMock.mockReset().mockResolvedValue("event-1");
    });

    it("requests a new item for the event's own period, shown but not editable", async () => {
      await asAssignedCoordinator();
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole("button", { name: "Request equipment" }));
      const dialog = await screen.findByRole("dialog", { name: "Request equipment" });
      expect(dialog).toHaveTextContent("Required period");
      expect(within(dialog).queryByDisplayValue(/2099-07-01T/)).not.toBeInTheDocument();

      await user.selectOptions(await within(dialog).findByRole("combobox"), "item-mic");
      await user.type(within(dialog).getByRole("spinbutton"), "2");
      await user.type(within(dialog).getByLabelText("Technical requirements"), "XLR");
      await user.click(within(dialog).getByRole("button", { name: "Request equipment" }));

      expect(saveEventEquipmentMock).toHaveBeenCalledWith("event-1", expect.any(Function));
      expect(applySavedChange([])).toEqual([
        expect.objectContaining({
          id: "",
          equipmentItemId: "item-mic",
          quantity: "2",
          notes: "XLR",
          requiredFrom: localDateTime("2099-07-01T02:00:00.000Z"),
          requiredUntil: localDateTime("2099-07-01T04:00:00.000Z"),
        }),
      ]);
      // The page reloads with the new equipment.
      expect(await screen.findByRole("button", { name: "Request equipment" })).toBeInTheDocument();
      expect(loadEventDetailMock).toHaveBeenCalledTimes(3);
    });

    // Request equipment takes the top-right spot; the history is on the event page.
    it("shows Request equipment instead of View change history", async () => {
      await asAssignedCoordinator();
      renderPage();

      expect(await screen.findByRole("button", { name: "Request equipment" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "View change history" })).not.toBeInTheDocument();
    });

    it("saves nothing until an item and a quantity are given", async () => {
      await asAssignedCoordinator();
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole("button", { name: "Request equipment" }));
      const dialog = await screen.findByRole("dialog", { name: "Request equipment" });
      await user.click(within(dialog).getByRole("button", { name: "Request equipment" }));

      expect(await within(dialog).findByText("Choose equipment from the catalogue")).toBeInTheDocument();
      expect(within(dialog).getByText("Enter a quantity")).toBeInTheDocument();
      expect(saveEventEquipmentMock).not.toHaveBeenCalled();
    });

    it("edits one item from its own card and leaves the others unchanged", async () => {
      await asAssignedCoordinator();
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole("button", { name: "Edit Projector" }));
      const dialog = await screen.findByRole("dialog", { name: "Edit Projector" });
      // Reserved by Technical Support Staff, so a change goes back to them.
      expect(dialog).toHaveTextContent("Changing it sends it back to Technical Support Staff to check again.");
      const quantity = within(dialog).getByRole("spinbutton");
      expect(quantity).toHaveValue(3);
      await user.clear(quantity);
      await user.type(quantity, "4");
      await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

      const saved = applySavedChange([
        { id: "req-proj", quantity: "3" },
        { id: "req-mic", quantity: "10" },
      ]);
      expect(saved).toEqual([
        expect.objectContaining({ id: "req-proj", quantity: "4" }),
        { id: "req-mic", quantity: "10" },
      ]);
    });

    it("removes one item after confirming", async () => {
      await asAssignedCoordinator();
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole("button", { name: "Remove Projector" }));
      const dialog = await screen.findByRole("dialog", { name: "Remove Projector?" });
      expect(dialog).toHaveTextContent("It is reserved, so Technical Support Staff will be asked to check and release it.");
      await user.click(within(dialog).getByRole("button", { name: "Remove" }));

      expect(
        applySavedChange([
          { id: "req-proj", quantity: "3" },
          { id: "req-mic", quantity: "10" },
        ]),
      ).toEqual([{ id: "req-mic", quantity: "10" }]);
    });

    it("keeps the dialog open and shows why when the save is refused", async () => {
      await asAssignedCoordinator();
      saveEventEquipmentMock.mockRejectedValue(new Error("Quantity must be a positive whole number"));
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole("button", { name: "Edit Projector" }));
      const dialog = await screen.findByRole("dialog", { name: "Edit Projector" });
      await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

      expect(await within(dialog).findByText("Quantity must be a positive whole number")).toBeInTheDocument();
      expect(screen.getByRole("dialog", { name: "Edit Projector" })).toBeInTheDocument();
    });

    it.each([
      ["another coordinator", { assignedCoordinatorId: "coordinator-2" }],
      ["the assigned coordinator of a Confirmed event", { status: "confirmed" }],
      ["the assigned coordinator of a Requested event", { status: "requested" }],
    ])("offers no request, edit or remove to %s", async (_who, overrides) => {
      await asAssignedCoordinator(overrides);
      renderPage();

      expect(await screen.findByText("Projector × 3")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Request equipment" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Edit / })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Remove / })).not.toBeInTheDocument();
    });
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
