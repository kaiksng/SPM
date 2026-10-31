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
vi.mock("@/features/safety-check/services/safety-plan", () => ({ saveEquipmentPlacement: vi.fn() }));

const loadEventDetailMock = vi.fn();
const listEquipmentArrangementsMock = vi.fn();
vi.mock("@/features/event-requests/services/event-details", () => ({
  loadEventDetail: (...args: unknown[]) => loadEventDetailMock(...args),
}));
vi.mock("@/features/event-requests/services/equipment-arrangements", () => ({
  EVENT_COMPLETED_RELEASE_REASON: "The event was completed",
  listEquipmentArrangements: (...args: unknown[]) => listEquipmentArrangementsMock(...args),
}));
const loadArrangementHistoryMock = vi.fn();
vi.mock("@/features/equipment/services/equipment-arrangement-status", () => ({
  loadEquipmentArrangementHistory: (...args: unknown[]) => loadArrangementHistoryMock(...args),
}));
const saveEventEquipmentMock = vi.fn();
vi.mock("@/features/event-requests/services/coordinator-event-edit", async () => ({
  ...(await vi.importActual<typeof import("@/features/event-requests/utils/local-date-time")>(
    "@/features/event-requests/utils/local-date-time",
  )),
  saveEventEquipment: (...args: unknown[]) => saveEventEquipmentMock(...args),
}));
// The real toEquipmentFormValues is kept; the catalogue load and the
// request are faked.
const requestEventEquipmentMock = vi.fn();
vi.mock("@/lib/supabase-client", () => ({ supabase: {} }));
vi.mock("@/features/event-requests/services/equipment", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/event-requests/services/equipment")>()),
  requestEventEquipment: (...args: unknown[]) => requestEventEquipmentMock(...args),
  loadEquipmentCatalogue: vi.fn().mockResolvedValue([
    { id: "item-req-proj", name: "Projector", category: "Visual", retired: false },
    { id: "item-mic", name: "Wired microphone", category: "Audio", retired: false },
  ]),
}));

import { OPEN_EQUIPMENT_REQUEST_STATE } from "@/features/event-requests/utils/equipment-request-navigation";
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
  requestedAt: "2099-06-01T02:00:00.000Z" as string | null,
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
  loadArrangementHistoryMock.mockReset().mockResolvedValue(new Map());
  loadEventDetailMock.mockReset().mockResolvedValue({
    id: "event-1",
    title: "Spring Expo",
    status: "planning",
    safetyCheckFlags: [],
    safetyCheckFlagReason: null,
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
      [
        { id: 1, status: "in_progress", note: "Reserved 1 of 3", updatedByName: "Tess Support", updatedAt: "2099-06-21T02:00:00.000Z" },
        { id: 2, status: "issue", note: "Request changed", updatedByName: "Lee Support", updatedAt: "2099-06-22T02:00:00.000Z" },
      ],
    ],
  ]);

  it("shows the assigned coordinator each item's status and history (AC02/AC03/AC07)", async () => {
    loadEventDetailMock.mockResolvedValue({
      ...(await loadEventDetailMock()),
      assignedCoordinatorId: "coordinator-1",
    });
    loadArrangementHistoryMock.mockResolvedValue(statuses);
    renderPage();

    const projector = (await screen.findByText("Projector × 3")).closest("li")!;
    expect(loadArrangementHistoryMock).toHaveBeenCalledWith(["event-1"]);
    // The status follows the reservation, whatever the history last said:
    // reserved in full is Arranged.
    expect(within(projector).getByText("Arrangement: Arranged")).toBeInTheDocument();
    expect(within(projector).getByText(/Updated by Lee Support/)).toBeInTheDocument();
    expect(within(projector).getByText("Arrangement history (2)")).toBeInTheDocument();

    // A flagged reservation is an issue, and one that was released hasn't been started.
    const mic = screen.getByText("Wireless microphone × 10").closest("li")!;
    expect(within(mic).getByText(/Arrangement: Issue/)).toHaveTextContent(/^Arrangement: Issue$/);
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
    loadArrangementHistoryMock.mockRejectedValue(new Error("We couldn't load the equipment arrangement statuses."));
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

      await user.click(await screen.findByRole("button", { name: "Add equipment" }));
      const dialog = await screen.findByRole("dialog", { name: "Add equipment" });
      expect(dialog).toHaveTextContent("Required period");
      expect(within(dialog).queryByDisplayValue(/2099-07-01T/)).not.toBeInTheDocument();

      await user.selectOptions(await within(dialog).findByRole("combobox"), "item-mic");
      await user.type(within(dialog).getByRole("spinbutton"), "2");
      await user.type(within(dialog).getByLabelText("Technical requirements"), "XLR");
      await user.click(within(dialog).getByRole("button", { name: "Add equipment" }));

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
      expect(await screen.findByRole("button", { name: "Add equipment" })).toBeInTheDocument();
      expect(loadEventDetailMock).toHaveBeenCalledTimes(3);
    });

    // Arriving from the catalogue's "Add equipment" opens the dialog straight away.
    function renderFromCatalogue() {
      return render(
        <MemoryRouter
          initialEntries={[{ pathname: "/events/event-1/equipment", state: OPEN_EQUIPMENT_REQUEST_STATE }]}
        >
          <Routes>
            <Route path="events/:eventId/equipment" element={<EventEquipmentPage />} />
          </Routes>
        </MemoryRouter>,
      );
    }

    it("opens Add equipment on arrival from the catalogue", async () => {
      await asAssignedCoordinator();
      renderFromCatalogue();

      expect(await screen.findByRole("dialog", { name: "Add equipment" })).toBeInTheDocument();
    });

    it("does not open it for someone who cannot add equipment for this event", async () => {
      await asAssignedCoordinator({ status: "confirmed" });
      renderFromCatalogue();

      expect(await screen.findByText("Projector × 3")).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // Add equipment takes the top-right spot; the history is on the event page.
    it("shows Add equipment instead of View change history", async () => {
      await asAssignedCoordinator();
      renderPage();

      expect(await screen.findByRole("button", { name: "Add equipment" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "View change history" })).not.toBeInTheDocument();
    });

    it("saves nothing until an item and a quantity are given", async () => {
      await asAssignedCoordinator();
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole("button", { name: "Add equipment" }));
      const dialog = await screen.findByRole("dialog", { name: "Add equipment" });
      await user.click(within(dialog).getByRole("button", { name: "Add equipment" }));

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
      expect(screen.queryByRole("button", { name: "Add equipment" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Edit / })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Remove / })).not.toBeInTheDocument();
    });
  });

  it("hides the status from anyone other than the assigned coordinator", async () => {
    loadEventDetailMock.mockResolvedValue({
      ...(await loadEventDetailMock()),
      assignedCoordinatorId: "coordinator-2",
    });
    loadArrangementHistoryMock.mockResolvedValue(statuses);
    renderPage();

    expect(await screen.findByText("Projector × 3")).toBeInTheDocument();
    expect(screen.queryByText(/^Arrangement:/)).not.toBeInTheDocument();
  });
});

// Requesting equipment: the organiser's list and anything the coordinator
// adds stay with the coordinator until they send it all to Technical Support
// Staff with one button.
describe("EventEquipmentPage (requesting equipment from Technical Support Staff)", () => {
  async function withUnrequested(overrides: Record<string, unknown> = {}) {
    loadEventDetailMock.mockResolvedValue({
      id: "event-1",
      title: "Spring Expo",
      status: "planning",
      safetyCheckFlags: [],
      safetyCheckFlagReason: null,
      assignedCoordinatorId: "coordinator-1",
      startsAt: "2099-07-01T02:00:00.000Z",
      endsAt: "2099-07-01T04:00:00.000Z",
      equipment: [
        requirement("req-proj", "Projector", 3),
        { ...requirement("req-cord", "Extension cord", 1), requestedAt: null },
        { ...requirement("req-clicker", "Presentation clicker", 2), requestedAt: null },
      ],
      ...overrides,
    });
  }

  beforeEach(() => {
    requestEventEquipmentMock.mockReset().mockResolvedValue(2);
  });

  it("marks items not yet requested, without an arrangement status", async () => {
    await withUnrequested();
    loadArrangementHistoryMock.mockResolvedValue(new Map());
    renderPage();

    const cord = (await screen.findByText("Extension cord × 1")).closest("li")!;
    expect(cord).toHaveTextContent("Not requested");
    expect(cord).not.toHaveTextContent(/Arrangement:/);
    const projector = screen.getByText("Projector × 3").closest("li")!;
    expect(projector).not.toHaveTextContent("Not requested");
    expect(screen.getByText(/2 items have not been requested from Technical Support Staff yet/)).toBeInTheDocument();
  });

  it("sends only the items the coordinator chooses, then reloads", async () => {
    await withUnrequested();
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Request equipment" }));
    const dialog = await screen.findByRole("dialog", { name: "Request equipment" });
    expect(within(dialog).getByRole("button", { name: "Request" })).toBeDisabled();

    await user.click(within(dialog).getByRole("checkbox", { name: "Request Extension cord" }));
    await user.click(within(dialog).getByRole("button", { name: "Request 1 item" }));

    expect(requestEventEquipmentMock).toHaveBeenCalledWith("event-1", ["req-cord"]);
    expect(await screen.findByText("Projector × 3")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Request equipment" })).not.toBeInTheDocument();
    expect(loadEventDetailMock).toHaveBeenCalledTimes(2);
  });

  it("shows items already requested ticked and locked", async () => {
    await withUnrequested();
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Request equipment" }));
    const dialog = await screen.findByRole("dialog", { name: "Request equipment" });

    const projector = within(dialog).getByRole("checkbox", { name: "Request Projector" });
    expect(projector).toBeChecked();
    expect(projector).toBeDisabled();
    const clicker = within(dialog).getByRole("checkbox", { name: "Request Presentation clicker" });
    expect(clicker).not.toBeChecked();
    expect(clicker).toBeEnabled();
  });

  it("lets an item whose reservation needs re-checking be requested again", async () => {
    await withUnrequested();
    listEquipmentArrangementsMock.mockResolvedValue([
      arrangement({ needsRecheck: true, recheckReason: "The equipment request changed" }),
    ]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Request equipment" }));
    const dialog = await screen.findByRole("dialog", { name: "Request equipment" });
    const projector = within(dialog).getByRole("checkbox", { name: "Request Projector" });
    expect(projector).toBeEnabled();
    expect(projector).not.toBeChecked();
    expect(dialog).toHaveTextContent("Issue · request again");

    await user.click(projector);
    await user.click(within(dialog).getByRole("button", { name: "Request 1 item" }));

    expect(requestEventEquipmentMock).toHaveBeenCalledWith("event-1", ["req-proj"]);
  });

  it("keeps the dialog open with the reason when the request is refused", async () => {
    await withUnrequested();
    requestEventEquipmentMock.mockRejectedValue(new Error("Equipment can only be requested while the event is in Planning"));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Request equipment" }));
    const dialog = await screen.findByRole("dialog", { name: "Request equipment" });
    await user.click(within(dialog).getByRole("checkbox", { name: "Request Extension cord" }));
    await user.click(within(dialog).getByRole("button", { name: "Request 1 item" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Equipment can only be requested while the event is in Planning",
    );
  });

  it("keeps Request equipment available once everything has been requested", async () => {
    await withUnrequested({ equipment: [requirement("req-proj", "Projector", 3)] });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Request equipment" }));
    const dialog = await screen.findByRole("dialog", { name: "Request equipment" });
    expect(within(dialog).getByRole("checkbox", { name: "Request Projector" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Request" })).toBeDisabled();
    expect(screen.queryByText(/not been requested/)).not.toBeInTheDocument();
  });

  it("asks for equipment to be added first when the event has none", async () => {
    await withUnrequested({ equipment: [] });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Request equipment" }));
    const dialog = await screen.findByRole("dialog", { name: "Request equipment" });
    expect(dialog).toHaveTextContent("This event has no equipment yet. Add equipment first.");
  });

  it("shows unrequested items to others without letting them send them", async () => {
    await withUnrequested({ assignedCoordinatorId: "coordinator-2" });
    renderPage();

    expect(await screen.findByText(/2 items have not been requested/)).toBeInTheDocument();
    expect(screen.queryByText(/Select Request equipment/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Request equipment/ })).not.toBeInTheDocument();
  });
});

// SPM-90: the Equipment step's safety check sits at the bottom of the page.
describe("EventEquipmentPage safety check", () => {
  it("lets the assigned coordinator record equipment placement during Planning", async () => {
    loadEventDetailMock.mockResolvedValue({
      ...(await loadEventDetailMock()),
      assignedCoordinatorId: "coordinator-1",
      equipmentPlacement: null,
    });
    renderPage();

    const check = await screen.findByRole("region", { name: "Safety check" });
    expect(within(check).getByRole("textbox", { name: "Equipment placement" })).toBeInTheDocument();
    expect(within(check).getByRole("button", { name: "Save equipment placement" })).toBeInTheDocument();
  });

  it("shows it read-only to others", async () => {
    loadEventDetailMock.mockResolvedValue({
      ...(await loadEventDetailMock()),
      assignedCoordinatorId: "coordinator-2",
      equipmentPlacement: "Stage left",
    });
    renderPage();

    const check = await screen.findByRole("region", { name: "Safety check" });
    expect(within(check).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(check).getByText("Stage left")).toBeInTheDocument();
  });

  it("isn't shown when the event has no equipment", async () => {
    loadEventDetailMock.mockResolvedValue({ ...(await loadEventDetailMock()), equipment: [] });
    renderPage();

    expect(await screen.findByText("No equipment was requested for this event.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Safety check" })).not.toBeInTheDocument();
  });

  it("shows the Safety Officer's reason when they flagged the placement", async () => {
    loadEventDetailMock.mockResolvedValue({
      ...(await loadEventDetailMock()),
      assignedCoordinatorId: "coordinator-1",
      equipmentPlacement: "Stage left",
      safetyCheckFlags: ["equipment_placement"],
      safetyCheckFlagReason: "Speakers block the fire exit.",
    });
    renderPage();

    const check = await screen.findByRole("region", { name: "Safety check" });
    expect(
      within(check).getByText("The Safety Officer asked for this to be revised: Speakers block the fire exit."),
    ).toBeInTheDocument();
    expect(within(check).getByRole("textbox", { name: "Equipment placement" })).toHaveValue("Stage left");
  });
});
