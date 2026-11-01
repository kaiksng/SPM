import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = {
  profile: { full_name: "Tess Support", role: "technical_support_staff" },
  user: { id: "support-1" },
  loading: false,
  session: {},
};

vi.mock("@/context/auth-context", () => ({ useAuth: () => authState }));
vi.mock("@/hooks/use-page-title", () => ({ usePageTitle: vi.fn() }));

const listAssignedEventsMock = vi.fn();
vi.mock("@/features/event-requests/services/assigned-events", () => ({
  listAssignedEvents: (...args: unknown[]) => listAssignedEventsMock(...args),
}));

const service = {
  listInventory: vi.fn(),
  listEquipmentCatalogue: vi.fn(),
  createEquipmentItem: vi.fn(),
  updateEquipmentItem: vi.fn(),
  addEquipmentUnits: vi.fn(),
  setEquipmentUnitRetired: vi.fn(),
  setEquipmentItemRetired: vi.fn(),
};

vi.mock("@/features/equipment/services/equipment-inventory", () => ({
  listInventory: (...args: unknown[]) => service.listInventory(...args),
  listEquipmentCatalogue: (...args: unknown[]) => service.listEquipmentCatalogue(...args),
  createEquipmentItem: (...args: unknown[]) => service.createEquipmentItem(...args),
  updateEquipmentItem: (...args: unknown[]) => service.updateEquipmentItem(...args),
  addEquipmentUnits: (...args: unknown[]) => service.addEquipmentUnits(...args),
  setEquipmentUnitRetired: (...args: unknown[]) => service.setEquipmentUnitRetired(...args),
  setEquipmentItemRetired: (...args: unknown[]) => service.setEquipmentItemRetired(...args),
}));

/** SPM-28: an item nothing has happened to yet. */
const NOT_STARTED = { status: "not_started", updatedByName: null, updatedAt: null, history: [] };

const listEventEquipmentAvailabilityMock = vi.fn();
const reserveEquipmentMock = vi.fn();
const changeEquipmentReservationMock = vi.fn();
const releaseEquipmentReservationMock = vi.fn();
vi.mock("@/features/equipment/services/equipment-availability", () => ({
  listEventEquipmentAvailability: () => listEventEquipmentAvailabilityMock(),
  reserveEquipment: (...args: unknown[]) => reserveEquipmentMock(...args),
  changeEquipmentReservation: (...args: unknown[]) => changeEquipmentReservationMock(...args),
  releaseEquipmentReservation: (...args: unknown[]) => releaseEquipmentReservationMock(...args),
}));

import { EquipmentPage } from "./EquipmentPage";

const MIC = "item-mic";
const PROJ = "item-proj";
const hours = (offset: number) => new Date(Date.now() + offset * 3_600_000).toISOString();
const units = (itemId: string, count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `${itemId}-unit-${index + 1}`,
    equipmentItemId: itemId,
    unitNumber: index + 1,
    retiredAt: null as string | null,
  }));

const inventory = () => [
  { id: MIC, name: "Wireless microphone", category: "Audio", code: "mic", totalQuantity: 3, retiredAt: null, units: units(MIC, 3) },
  { id: PROJ, name: "Projector", category: "Visual", code: "proj", totalQuantity: 2, retiredAt: null, units: units(PROJ, 2) },
  { id: "item-old", name: "Overhead projector", category: "Visual", code: "ohp", totalQuantity: 1, retiredAt: hours(-48), units: units("item-old", 1) },
];

/** Technical Support Staff sections are separate pages: /equipment, /equipment/inventory. */
function renderPage(path = "/equipment") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="equipment" element={<EquipmentPage />} />
        <Route path="equipment/inventory" element={<EquipmentPage section="inventory" />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Event requests are sorted into tabs: All / Need attention / Arranged / Issue. */
async function showTab(name: "All" | "Need attention" | "Arranged" | "Issue") {
  await userEvent.setup().click(await screen.findByRole("tab", { name: new RegExp(`^${name}`) }));
}

/** Each item shows one main button; its other actions are under its ⋯ menu. */
async function chooseMoreAction(user: ReturnType<typeof userEvent.setup>, item: string, action: string) {
  await user.click(await screen.findByRole("button", { name: `More actions for ${item}` }));
  await user.click(await screen.findByRole("menuitem", { name: action }));
}

beforeEach(() => {
  authState.profile = { full_name: "Tess Support", role: "technical_support_staff" };
  for (const mock of Object.values(service)) mock.mockReset().mockResolvedValue(undefined);
  service.listInventory.mockResolvedValue(inventory());
  service.listEquipmentCatalogue.mockResolvedValue([]);
  listEventEquipmentAvailabilityMock.mockReset().mockResolvedValue([]);
  reserveEquipmentMock.mockReset().mockResolvedValue(undefined);
  changeEquipmentReservationMock.mockReset().mockResolvedValue(undefined);
  releaseEquipmentReservationMock.mockReset().mockResolvedValue(undefined);
});

/** Inventory is its own page. */
async function renderInventory() {
  renderPage("/equipment/inventory");
  await screen.findByRole("heading", { name: "Inventory" });
}

let lastEquipmentSearch = "";
function EquipmentLocationSpy() {
  lastEquipmentSearch = useLocation().search;
  return null;
}

/** Renders EquipmentPage with a spy that records its URL as filters/search change. */
function renderPageWithLocationSpy(path = "/equipment") {
  lastEquipmentSearch = "";
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="equipment"
          element={
            <>
              <EquipmentPage />
              <EquipmentLocationSpy />
            </>
          }
        />
        <Route
          path="equipment/inventory"
          element={
            <>
              <EquipmentPage section="inventory" />
              <EquipmentLocationSpy />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

// SPM-48 AC01: technical support staff get the inventory actions their role permits.
describe("EquipmentPage inventory for Technical Support Staff", () => {
  it("summarises equipment types", async () => {
    await renderInventory();

    expect((await screen.findByText("Equipment types")).nextSibling).toHaveTextContent("2");
    expect(screen.queryByText("Out of service now")).not.toBeInTheDocument();
    expect(screen.queryByText("Available now", { selector: "p" })).not.toBeInTheDocument();
    expect(screen.queryByText("Retired types")).not.toBeInTheDocument();
  });

  it("groups items by category and hides retired items until asked", async () => {
    const user = userEvent.setup();
    await renderInventory();

    expect(await screen.findByRole("region", { name: "Audio" })).toHaveTextContent("Wireless microphone");
    expect(screen.queryByText("Overhead projector")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Show retired"));
    expect(screen.getByText("Overhead projector")).toBeInTheDocument();
  });

  it("finds an item by name, code or unit ID", async () => {
    const user = userEvent.setup();
    await renderInventory();

    const search = await screen.findByLabelText("Search equipment");
    await user.type(search, "mic-2");
    expect(screen.getByText("Wireless microphone")).toBeInTheDocument();
    expect(screen.queryByText("Projector")).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "proj");
    expect(screen.getByText("Projector")).toBeInTheDocument();
    expect(screen.queryByText("Wireless microphone")).not.toBeInTheDocument();
  });

  it("filters by category", async () => {
    const user = userEvent.setup();
    await renderInventory();

    await user.click(screen.getByRole("radio", { name: "Visual" }));
    expect(screen.getByText("Projector")).toBeInTheDocument();
    expect(screen.queryByText("Wireless microphone")).not.toBeInTheDocument();
  });

  it("shows a removable chip for the active category filter", async () => {
    const user = userEvent.setup();
    await renderInventory();

    await user.click(screen.getByRole("radio", { name: "Visual" }));

    const chip = await screen.findByRole("button", { name: "Remove Visual filter" });
    await user.click(chip);

    expect(screen.getByText("Wireless microphone")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Visual filter" })).not.toBeInTheDocument();
  });

  it("combines category and show-retired filters, and clears them from the no-match state", async () => {
    const items = inventory();
    items[1]!.retiredAt = hours(-5);
    service.listInventory.mockResolvedValue(items);
    const user = userEvent.setup();
    await renderInventory();

    await user.click(screen.getByRole("radio", { name: "Visual" }));

    // Projector is retired and "Show retired" is off, so nothing in Visual matches.
    expect(await screen.findByText(/No equipment matches your search or filters/)).toBeInTheDocument();

    await user.click(screen.getByLabelText("Show retired"));
    expect(screen.getByText("Projector")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "All categories" }));
    await user.click(screen.getByLabelText("Show retired"));
    expect(screen.getByText("Wireless microphone")).toBeInTheDocument();
  });

  it("shows 'No equipment yet' for an empty inventory, distinct from a no-match search", async () => {
    service.listInventory.mockResolvedValue([]);
    const user = userEvent.setup();
    await renderInventory();

    expect(await screen.findByText("No equipment yet")).toBeInTheDocument();
    expect(screen.queryByText(/No equipment matches your search/)).not.toBeInTheDocument();

    await user.type(await screen.findByLabelText("Search equipment"), "mic");
    expect(screen.getByText("No equipment yet")).toBeInTheDocument();
    expect(screen.queryByText(/No equipment matches your search/)).not.toBeInTheDocument();
  });

  // SPM-74 AC03: the "Show retired" toggle is its own removable chip.
  it("shows a removable chip for the 'Show retired' toggle", async () => {
    const items = inventory();
    items[1]!.retiredAt = hours(-5);
    service.listInventory.mockResolvedValue(items);
    const user = userEvent.setup();
    await renderInventory();

    await user.click(screen.getByLabelText("Show retired"));
    const chip = await screen.findByRole("button", { name: "Remove Showing retired filter" });
    expect(screen.getByText("Projector")).toBeInTheDocument();

    await user.click(chip);

    expect(
      screen.queryByRole("button", { name: "Remove Showing retired filter" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Projector")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Show retired")).not.toBeChecked();
  });

  // SPM-74 AC05/AC07: the inventory's filters and search persist in the URL
  // and restore from it, same as the catalogue and Venues views.
  it("keeps the inventory's active filters and search in the URL", async () => {
    const user = userEvent.setup();
    renderPageWithLocationSpy("/equipment/inventory");
    await screen.findByRole("heading", { name: "Inventory" });

    await user.click(screen.getByRole("radio", { name: "Visual" }));
    await user.type(screen.getByLabelText("Search equipment"), "proj");

    expect(lastEquipmentSearch).toContain("category=Visual");
    expect(lastEquipmentSearch).toContain("q=proj");
  });

  it("restores the inventory's filters and search from the URL on mount", async () => {
    renderPage("/equipment/inventory?category=Visual&q=proj");
    await screen.findByRole("heading", { name: "Inventory" });

    expect(await screen.findByText("Projector")).toBeInTheDocument();
    expect(screen.queryByText("Wireless microphone")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Search equipment")).toHaveValue("proj");
  });

  it("lists each unit by ID and opens it", async () => {
    const user = userEvent.setup();
    await renderInventory();

    await user.click(await screen.findByRole("button", { name: "Show Wireless microphone units" }));
    const grid = screen.getByRole("list", { name: "Wireless microphone units" });
    expect(within(grid).getAllByRole("button").map((unit) => unit.textContent)).toEqual(["mic-1", "mic-2", "mic-3"]);
    expect(within(grid).getByRole("button", { name: "mic-2" })).toHaveAttribute("title", "In service");
    // Units can no longer be marked unavailable, only retired.
    expect(screen.queryByRole("button", { name: "Select units" })).not.toBeInTheDocument();

    await user.click(within(grid).getByRole("button", { name: "mic-2" }));
    const dialog = screen.getByRole("dialog", { name: "mic-2 · Wireless microphone" });
    expect(within(dialog).getByText("In service")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /Mark unavailable/ })).not.toBeInTheDocument();
  });

  it("retires a unit from its dialog", async () => {
    const user = userEvent.setup();
    await renderInventory();

    await user.click(await screen.findByRole("button", { name: "Show Wireless microphone units" }));
    await user.click(screen.getByRole("button", { name: "mic-3" }));
    const dialog = screen.getByRole("dialog", { name: "mic-3 · Wireless microphone" });
    await user.click(within(dialog).getByRole("button", { name: "Retire unit" }));
    expect(service.setEquipmentUnitRetired).not.toHaveBeenCalled();
    expect(within(dialog).getByText("Retire mic-3?")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Retire mic-3" }));

    await waitFor(() => expect(service.setEquipmentUnitRetired).toHaveBeenCalledWith(`${MIC}-unit-3`, true));
    expect(await screen.findByText("mic-3 retired.")).toBeInTheDocument();
  });

  it("shows a retired unit struck through", async () => {
    const items = inventory();
    items[0]!.units[0]!.retiredAt = hours(-5);
    service.listInventory.mockResolvedValue(items);
    const user = userEvent.setup();
    await renderInventory();

    await user.click(await screen.findByRole("button", { name: "Show Wireless microphone units" }));
    expect(screen.getByRole("button", { name: "mic-1" })).toHaveClass("line-through");
  });

  it("adds units after the highest existing one", async () => {
    const user = userEvent.setup();
    await renderInventory();

    await user.click(await screen.findByRole("button", { name: "Show Wireless microphone units" }));
    expect(screen.getByText("New units continue from mic-4")).toBeInTheDocument();
    const count = screen.getByLabelText("Add units");
    await user.clear(count);
    await user.type(count, "5");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(service.addEquipmentUnits).toHaveBeenCalledWith(MIC, 5));
    expect(await screen.findByText("5 units added.")).toBeInTheDocument();
  });

  it("adds a new item with its first units", async () => {
    const user = userEvent.setup();
    await renderInventory();

    await user.click(await screen.findByRole("button", { name: /Add equipment/ }));
    const dialog = screen.getByRole("dialog", { name: "Add equipment" });
    await user.click(within(dialog).getByRole("button", { name: "Add equipment" }));
    expect(within(dialog).getByText("Enter a name")).toBeInTheDocument();
    expect(service.createEquipmentItem).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText("Name"), "Fog machine");
    await user.type(within(dialog).getByRole("combobox", { name: "Category" }), "Lighting");
    await user.type(within(dialog).getByLabelText("Code"), "fog");
    expect(within(dialog).getByText("Units are labelled fog-1, fog-2, …")).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText("Number of units"));
    await user.type(within(dialog).getByLabelText("Number of units"), "4");
    await user.click(within(dialog).getByRole("button", { name: "Add equipment" }));

    await waitFor(() =>
      expect(service.createEquipmentItem).toHaveBeenCalledWith(
        { name: "Fog machine", category: "Lighting", code: "fog" },
        4,
      ),
    );
  });

  it("shows a server error inside the add dialog", async () => {
    service.createEquipmentItem.mockRejectedValue(new Error("Another item already uses the code mic"));
    const user = userEvent.setup();
    await renderInventory();

    await user.click(await screen.findByRole("button", { name: /Add equipment/ }));
    const dialog = screen.getByRole("dialog", { name: "Add equipment" });
    await user.type(within(dialog).getByLabelText("Name"), "Lapel microphone");
    await user.type(within(dialog).getByRole("combobox", { name: "Category" }), "Audio");
    await user.type(within(dialog).getByLabelText("Code"), "mic");
    await user.click(within(dialog).getByRole("button", { name: "Add equipment" }));

    expect(await within(dialog).findByText("Another item already uses the code mic")).toBeInTheDocument();
  });

  it("edits an item", async () => {
    const user = userEvent.setup();
    await renderInventory();

    await user.click(await screen.findByRole("button", { name: "Edit Projector" }));
    const dialog = screen.getByRole("dialog", { name: "Edit Projector" });
    expect(within(dialog).getByLabelText("Code")).toHaveValue("proj");
    await user.clear(within(dialog).getByLabelText("Name"));
    await user.type(within(dialog).getByLabelText("Name"), "Laser projector");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(service.updateEquipmentItem).toHaveBeenCalledWith(PROJ, {
        name: "Laser projector",
        category: "Visual",
        code: "proj",
      }),
    );
  });

  it("retires an item", async () => {
    const user = userEvent.setup();
    await renderInventory();

    const row = (await screen.findByText("Projector")).closest("li")!;
    await user.click(within(row).getByRole("button", { name: "Retire" }));
    const confirm = screen.getByRole("dialog", { name: "Retire Projector?" });
    expect(service.setEquipmentItemRetired).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole("button", { name: "Retire Projector" }));

    await waitFor(() => expect(service.setEquipmentItemRetired).toHaveBeenCalledWith(PROJ, true));
  });

  it("does not retire an item when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    await renderInventory();

    const row = (await screen.findByText("Projector")).closest("li")!;
    await user.click(within(row).getByRole("button", { name: "Retire" }));
    await user.click(within(screen.getByRole("dialog", { name: "Retire Projector?" })).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(service.setEquipmentItemRetired).not.toHaveBeenCalled();
  });
});

describe("EquipmentPage event requests (SPM-31)", () => {
  const result = (overrides: Record<string, unknown>) => ({
    requirementId: "req",
    equipmentItemId: PROJ,
    equipmentName: "Projector",
    itemCode: "proj",
    itemRetired: false,
    requestedQuantity: 3,
    requiredFrom: hours(24),
    requiredUntil: hours(28),
    technicalRequirements: null,
    totalUnits: 100,
    reservedQuantity: 0,
    availableQuantity: 100,
    status: "available",
    reservation: null,
    arrangement: NOT_STARTED,
    ...overrides,
  });

  beforeEach(() => {
    listEventEquipmentAvailabilityMock.mockResolvedValue([
      {
        id: "event-gala",
        title: "Annual Gala",
        status: "planning",
        startsAt: hours(24),
        endsAt: hours(28),
        results: [
          result({ requirementId: "r1", technicalRequirements: "HDMI input", reservedQuantity: 40 }),
          result({ requirementId: "r2", equipmentName: "Wireless microphone", itemCode: "mic", requestedQuantity: 80, availableQuantity: 60, status: "partially_available" }),
          result({ requirementId: "r3", equipmentName: "Smoke machine", itemCode: "smoke", requestedQuantity: 1, availableQuantity: 0, totalUnits: 2, status: "unavailable" }),
          result({ requirementId: "r4", equipmentItemId: null, equipmentName: "Old smoke machine", itemCode: null, requestedQuantity: 1, availableQuantity: 0, requiredFrom: null, requiredUntil: null, status: "unknown" }),
        ],
      },
      {
        id: "event-talk",
        title: "Tech Talk",
        status: "requested",
        startsAt: hours(48),
        endsAt: hours(50),
        results: [result({ requirementId: "r5" })],
      },
    ]);
  });

  // Nobody has started on these yet; the three Annual Gala items that cannot
  // be supplied in full count as Issue even though they are Not started.
  it("opens on All, counting each tab", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Event requests" })).toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: /^All/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "All5",
      "Need attention2",
      "Arranged0",
      "Issue3",
    ]);
    // The event header still summarises all of its items.
    expect(await screen.findByRole("listitem", { name: "Annual Gala" })).toHaveTextContent("3 of 4 items have an issue");
    // Nothing wrong, but nothing reserved yet either: not green.
    expect(screen.getByRole("listitem", { name: "Tech Talk" })).toHaveTextContent("1 of 1 item still to arrange");
  });

  it("sorts each item into one tab, and shows them all under All", async () => {
    const started = (status: string) => ({
      status,
      updatedByName: "Tess Support",
      updatedAt: hours(-1),
      history: [{ id: 1, status, note: null, updatedByName: "Tess Support", updatedAt: hours(-1) }],
    });
    listEventEquipmentAvailabilityMock.mockResolvedValue([
      {
        id: "event-gala",
        title: "Annual Gala",
        status: "planning",
        startsAt: hours(24),
        endsAt: hours(28),
        results: [
          result({ requirementId: "r1" }),
          result({ requirementId: "r2", equipmentName: "Wireless microphone", arrangement: started("in_progress") }),
          result({ requirementId: "r3", equipmentName: "Smoke machine", arrangement: started("issue") }),
        ],
      },
    ]);
    renderPage();

    const all = await screen.findByRole("listitem", { name: "Annual Gala" });
    expect(within(all).getByText("Projector × 3")).toBeInTheDocument();
    expect(within(all).getByText("Smoke machine × 3")).toBeInTheDocument();

    // Not started and In progress are both still to be arranged.
    await showTab("Need attention");
    const attention = await screen.findByRole("listitem", { name: "Annual Gala" });
    expect(within(attention).getByText("Projector × 3")).toBeInTheDocument();
    expect(within(attention).getByText("Wireless microphone × 3")).toBeInTheDocument();
    // The event's other item is still in view, below, with no actions.
    const alsoNeeded = within(attention).getByRole("region", { name: "Also needed for Annual Gala" });
    expect(within(alsoNeeded).getByText("Smoke machine × 3")).toBeInTheDocument();
    expect(within(alsoNeeded).queryByRole("button")).not.toBeInTheDocument();

    await showTab("Issue");
    const issue = await screen.findByRole("listitem", { name: "Annual Gala" });
    const smokeRow = within(issue).getByText("Smoke machine × 3").closest("li")!;
    expect(within(smokeRow).getByRole("button", { name: "Reserve available" })).toBeInTheDocument();
    expect(within(issue).getAllByRole("button", { name: /^Reserve/ })).toHaveLength(1);
    expect(
      within(within(issue).getByRole("region", { name: "Also needed for Annual Gala" })).getByText("Projector × 3"),
    ).toBeInTheDocument();

    await showTab("Arranged");
    expect(await screen.findByText("Nothing has been arranged yet.")).toBeInTheDocument();
  });

  it("shows each item's result and available quantity (AC01/AC04)", async () => {
    renderPage();

    const readyGala = await screen.findByRole("listitem", { name: "Annual Gala" });
    const projector = within(readyGala).getByText("Projector × 3").closest("li")!;
    expect(projector).toHaveTextContent("Available");
    expect(projector).toHaveTextContent("100 available");
    expect(projector).toHaveTextContent("Technical requirements: HDMI input");
    expect(projector).toHaveTextContent("100 in service · 40 reserved");

    const gala = await screen.findByRole("listitem", { name: "Annual Gala" });
    const mic = within(gala).getByText("Wireless microphone × 80").closest("li")!;
    expect(mic).toHaveTextContent("Partially available");
    expect(mic).toHaveTextContent("60 available");

    const smoke = within(gala).getByText("Smoke machine × 1").closest("li")!;
    expect(smoke).toHaveTextContent("Unavailable");
    expect(smoke).toHaveTextContent("0 available");
  });

  it("states the shortage before any reservation (scenario)", async () => {
    renderPage();

    const readyGala = await screen.findByRole("listitem", { name: "Annual Gala" });
    expect(within(readyGala).getByText("Projector × 3").closest("li")).not.toHaveTextContent("Short by");
    const gala = await screen.findByRole("listitem", { name: "Annual Gala" });
    expect(within(gala).getByText("Wireless microphone × 80").closest("li")).toHaveTextContent("Short by 20");
    expect(within(gala).getByText("Smoke machine × 1").closest("li")).toHaveTextContent("Short by 1");
  });

  it("identifies unknown equipment instead of treating it as available (SPM-31 AC04)", async () => {
    renderPage();

    const legacy = (await screen.findByText("Old smoke machine × 1")).closest("li")!;
    expect(legacy).toHaveTextContent("Unknown equipment");
    expect(legacy).toHaveTextContent("Not in the catalogue — check manually");
    expect(legacy).not.toHaveTextContent("available");
  });

  it("searches events by name", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByLabelText("Search events"), "talk");
    expect(screen.getByRole("listitem", { name: "Tech Talk" })).toBeInTheDocument();
    expect(screen.queryByRole("listitem", { name: "Annual Gala" })).not.toBeInTheDocument();
  });
});

describe("EquipmentPage reserving equipment", () => {
  const base = {
    requirementId: "req-proj",
    equipmentItemId: PROJ,
    equipmentName: "Projector",
    itemCode: "proj",
    itemRetired: false,
    requestedQuantity: 50,
    requiredFrom: hours(24),
    requiredUntil: hours(28),
    technicalRequirements: null,
    totalUnits: 100,
    reservedQuantity: 0,
    availableQuantity: 40,
    status: "partially_available",
    reservation: null as null | Record<string, unknown>,
    arrangement: NOT_STARTED as Record<string, unknown>,
  };
  const eventWith = (results: Array<Record<string, unknown>>, status = "planning") => [
    { id: "event-expo", title: "Spring Expo", status, startsAt: hours(24), endsAt: hours(28), results },
  ];

  // AC4/AC5: a reservation whose request was removed still holds stock; staff find it under Issue and release it.
  it("lists a reservation whose request was removed under Issue and releases it", async () => {
    listEventEquipmentAvailabilityMock.mockResolvedValue([
      {
        id: "event-expo",
        title: "Spring Expo",
        status: "planning",
        startsAt: hours(24),
        endsAt: hours(28),
        results: [],
        orphanedReservations: [
          {
            id: "res-orphan",
            equipmentName: "Projector",
            quantity: 5,
            startsAt: hours(24),
            endsAt: hours(28),
            recheckReason: "The equipment request was removed",
            reservedByName: "Tess Support",
            reservedAt: hours(-1),
          },
        ],
      },
    ]);
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("tab", { name: /^Issue/ })).toHaveTextContent("1");
    await user.click(screen.getByRole("tab", { name: /^Issue/ }));
    const row = (await screen.findByText("Projector × 5 reserved")).closest("li")!;
    expect(row).toHaveTextContent("Needs re-check: The equipment request was removed");
    expect(row).toHaveTextContent("Still held from the available pool until released · reserved by Tess Support");
    expect(within(row).queryByRole("button", { name: "Change" })).not.toBeInTheDocument();

    await user.click(within(row).getByRole("button", { name: "Release" }));
    const dialog = screen.getByRole("dialog", { name: "Release Projector reservation" });
    expect(within(dialog).getByText(/the 5 reserved will return to the available pool/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Reason/), "Request removed");
    await user.click(within(dialog).getByRole("button", { name: "Release" }));

    await waitFor(() => expect(releaseEquipmentReservationMock).toHaveBeenCalledWith("res-orphan", "Request removed"));
    expect(await screen.findByText("Reservation released.")).toBeInTheDocument();
  });

  // Only 40 of the 50 can be provided, so the item is an Issue and its main
  // button reserves what is available.
  it("reserves an item, defaulting to what can be provided (SPM-32 AC01)", async () => {
    listEventEquipmentAvailabilityMock.mockResolvedValue(eventWith([base]));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Reserve available" }));
    const dialog = screen.getByRole("dialog", { name: "Reserve Projector" });
    expect(within(dialog).getByText(/50 requested · 40 available for this period/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Quantity to reserve")).toHaveValue(40);
    await user.click(within(dialog).getByRole("button", { name: "Reserve" }));

    await waitFor(() => expect(reserveEquipmentMock).toHaveBeenCalledWith("req-proj", 40));
    expect(await screen.findByText("Equipment reserved.")).toBeInTheDocument();
  });

  it("shows the rejection and the available quantity when there are not enough (SPM-32 AC02)", async () => {
    listEventEquipmentAvailabilityMock.mockResolvedValue(eventWith([base]));
    reserveEquipmentMock.mockRejectedValue(new Error("Only 40 available for this period"));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Reserve available" }));
    const dialog = screen.getByRole("dialog", { name: "Reserve Projector" });
    await user.clear(within(dialog).getByLabelText("Quantity to reserve"));
    await user.type(within(dialog).getByLabelText("Quantity to reserve"), "45");
    await user.click(within(dialog).getByRole("button", { name: "Reserve" }));

    expect(await within(dialog).findByText("Only 40 available for this period")).toBeInTheDocument();
  });

  it("will not reserve more than was requested", async () => {
    listEventEquipmentAvailabilityMock.mockResolvedValue(eventWith([{ ...base, availableQuantity: 100, status: "available" }]));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Reserve" }));
    const dialog = screen.getByRole("dialog", { name: "Reserve Projector" });
    await user.clear(within(dialog).getByLabelText("Quantity to reserve"));
    await user.type(within(dialog).getByLabelText("Quantity to reserve"), "60");
    await user.click(within(dialog).getByRole("button", { name: "Reserve" }));

    expect(within(dialog).getByText("Cannot reserve more than the 50 requested")).toBeInTheDocument();
    expect(reserveEquipmentMock).not.toHaveBeenCalled();
  });

  // Reserved in part: the next step is reserving the rest; change and release are under ⋯.
  it("shows who reserved what, and offers to reserve the rest instead of reserve", async () => {
    listEventEquipmentAvailabilityMock.mockResolvedValue(
      eventWith([
        {
          ...base,
          availableQuantity: 100,
          status: "available",
          reservation: { id: "res-1", quantity: 40, needsRecheck: false, recheckReason: null, reservedByName: "Tess Support", reservedAt: hours(-1) },
        },
      ]),
    );
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText(/Reserved 40 of 50 by Tess Support/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reserve" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reserve the rest" })).toBeInTheDocument();
    expect(screen.getByText("1 of 1 reserved")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "More actions for Projector" }));
    expect(
      (await screen.findAllByRole("menuitem")).map((item) => item.textContent),
    ).toEqual(["Change quantity", "Release"]);
  });

  it("reserves the rest by entering only the additional quantity (SPM-32 AC05)", async () => {
    listEventEquipmentAvailabilityMock.mockResolvedValue(
      eventWith([
        {
          ...base,
          availableQuantity: 100,
          status: "available",
          reservation: { id: "res-1", quantity: 40, needsRecheck: false, recheckReason: null, reservedByName: null, reservedAt: null },
        },
      ]),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Reserve the rest" }));
    const dialog = await screen.findByRole("dialog", { name: "Reserve more Projector" });
    expect(within(dialog).getByText("50 required · 40 already reserved · 10 remaining")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Additional quantity to reserve")).toHaveValue(10);
    expect(within(dialog).getByText("After saving: 50 of 50 reserved.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Reserve additional units" }));

    await waitFor(() => expect(changeEquipmentReservationMock).toHaveBeenCalledWith("res-1", 50));
  });

  // SPM-32 AC02/AC05: top-ups use free stock and send a new total, not a delta.
  it.each([
    [4, "2", 3],
    [4, "1", 2],
    [2, "1", 2],
  ])("adds stock with availability %s and additional quantity %s", async (availableQuantity, additional, total) => {
    listEventEquipmentAvailabilityMock.mockResolvedValue(eventWith([{
      ...base, requestedQuantity: 3, availableQuantity,
      status: availableQuantity >= 3 ? "available" : "partially_available",
      reservation: { id: "res-1", quantity: 1, needsRecheck: false, recheckReason: null, reservedByName: null, reservedAt: null },
    }]));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Reserve the rest" }));
    const dialog = await screen.findByRole("dialog", { name: "Reserve more Projector" });
    expect(within(dialog).getByText("3 required · 1 already reserved · 2 remaining")).toBeInTheDocument();
    const input = within(dialog).getByLabelText("Additional quantity to reserve");
    expect(input).toHaveValue(Math.min(2, availableQuantity - 1));
    await user.clear(input);
    await user.type(input, additional);
    expect(within(dialog).getByText(`After saving: ${total} of 3 reserved.`)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Reserve additional units" }));
    await waitFor(() => expect(changeEquipmentReservationMock).toHaveBeenCalledWith("res-1", total));
    expect(reserveEquipmentMock).not.toHaveBeenCalled();
  });

  it.each([
    [4, "0", "Enter a positive whole number"],
    [4, "3", "Cannot reserve more than the 3 requested"],
    [2, "2", "Only 1 additional unit available for this period"],
  ])("refuses an invalid top-up with availability %s and quantity %s", async (availableQuantity, additional, message) => {
    listEventEquipmentAvailabilityMock.mockResolvedValue(eventWith([{
      ...base, requestedQuantity: 3, availableQuantity,
      status: availableQuantity >= 3 ? "available" : "partially_available",
      reservation: { id: "res-1", quantity: 1, needsRecheck: false, recheckReason: null, reservedByName: null, reservedAt: null },
    }]));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Reserve the rest" }));
    const dialog = await screen.findByRole("dialog", { name: "Reserve more Projector" });
    await user.clear(within(dialog).getByLabelText("Additional quantity to reserve"));
    await user.type(within(dialog).getByLabelText("Additional quantity to reserve"), additional);
    await user.click(within(dialog).getByRole("button", { name: "Reserve additional units" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(message);
    expect(changeEquipmentReservationMock).not.toHaveBeenCalled();
  });

  it("shows a server rejection if stock changes while the top-up dialog is open", async () => {
    listEventEquipmentAvailabilityMock.mockResolvedValue(eventWith([{
      ...base, requestedQuantity: 3, availableQuantity: 4, status: "available",
      reservation: { id: "res-1", quantity: 1, needsRecheck: false, recheckReason: null, reservedByName: null, reservedAt: null },
    }]));
    changeEquipmentReservationMock.mockRejectedValue(new Error("Only 1 available for this period"));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Reserve the rest" }));
    const dialog = await screen.findByRole("dialog", { name: "Reserve more Projector" });
    await user.click(within(dialog).getByRole("button", { name: "Reserve additional units" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Only 1 available for this period");
    expect(within(dialog).getByLabelText("Additional quantity to reserve")).toHaveValue(2);
    expect(within(dialog).getByRole("button", { name: "Reserve additional units" })).toBeEnabled();
  });

  // A Confirmed event's equipment was arranged before it was confirmed.
  it("lists a Confirmed event's equipment but offers nothing more to reserve", async () => {
    listEventEquipmentAvailabilityMock.mockResolvedValue(
      eventWith(
        [
          { ...base, availableQuantity: 100, status: "available" },
          {
            ...base,
            requirementId: "req-mic",
            equipmentName: "Microphone",
            availableQuantity: 100,
            status: "available",
            reservation: { id: "res-1", quantity: 20, needsRecheck: false, recheckReason: null, reservedByName: null, reservedAt: null },
          },
        ],
        "confirmed",
      ),
    );
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("Projector × 50")).toBeInTheDocument();
    expect(screen.getByText("Microphone × 50")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Reserve/ })).not.toBeInTheDocument();
    expect(
      screen.getAllByText("Event confirmed. Its equipment is already arranged, so nothing more can be reserved."),
    ).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "More actions for Microphone" }));
    expect((await screen.findAllByRole("menuitem")).map((item) => item.textContent)).toEqual(["Release"]);
  });

  // Green means done: the event badge is green only when every item is reserved
  // in full, and a reservation's box only once it covers the whole request.
  it("shows green only for equipment that is fully arranged", async () => {
    listEventEquipmentAvailabilityMock.mockResolvedValue(
      eventWith([
        {
          ...base,
          availableQuantity: 100,
          status: "available",
          reservation: { id: "res-1", quantity: 50, needsRecheck: false, recheckReason: null, reservedByName: null, reservedAt: null },
          arrangement: { status: "arranged", updatedByName: "Tess Support", updatedAt: hours(-1), history: [] },
        },
      ]),
    );
    renderPage();

    const card = await screen.findByRole("listitem", { name: "Spring Expo" });
    expect(within(card).getByText("All equipment arranged")).toHaveClass("bg-emerald-100");
    expect(within(card).getByText(/Reserved 50 of 50/, { selector: "p" }).parentElement).toHaveClass("bg-emerald-50");
  });

  it("shows a part-reserved item in amber, not green", async () => {
    listEventEquipmentAvailabilityMock.mockResolvedValue(
      eventWith([
        {
          ...base,
          availableQuantity: 100,
          status: "available",
          reservation: { id: "res-1", quantity: 40, needsRecheck: false, recheckReason: null, reservedByName: null, reservedAt: null },
        },
      ]),
    );
    renderPage();

    const card = await screen.findByRole("listitem", { name: "Spring Expo" });
    expect(within(card).getByText("1 of 1 item still to arrange")).not.toHaveClass("bg-emerald-100");
    expect(within(card).getByText(/Reserved 40 of 50/, { selector: "p" }).parentElement).toHaveClass("bg-amber-50");
  });

  it("offers no main button once an item is reserved in full", async () => {
    listEventEquipmentAvailabilityMock.mockResolvedValue(
      eventWith([
        {
          ...base,
          availableQuantity: 100,
          status: "available",
          reservation: { id: "res-1", quantity: 50, needsRecheck: false, recheckReason: null, reservedByName: null, reservedAt: null },
        },
      ]),
    );
    renderPage();

    const row = (await screen.findByText(/Reserved 50 of 50/)).closest("li")!;
    expect(within(row).getAllByRole("button").map((button) => button.getAttribute("aria-label") ?? button.textContent)).toEqual([
      "More actions for Projector",
    ]);
  });

  // AC3: once reserved, the item's own reservation no longer counts as available.
  it("counts the item's own reservation in what is reserved and what is left", async () => {
    listEventEquipmentAvailabilityMock.mockResolvedValue(
      eventWith([
        {
          ...base,
          reservedQuantity: 10,
          availableQuantity: 90,
          status: "available",
          reservation: { id: "res-1", quantity: 40, needsRecheck: false, recheckReason: null, reservedByName: "Tess Support", reservedAt: hours(-1) },
        },
      ]),
    );
    renderPage();

    const row = (await screen.findByText(/Reserved 40 of 50 by Tess Support/)).closest("li")!;
    expect(row).toHaveTextContent("100 in service · 50 reserved");
    expect(row).toHaveTextContent("50 available");
    expect(row).toHaveTextContent("40 reserved for this event");
    expect(row).not.toHaveTextContent("90 available");
    // Covered by its reservation, so no shortage is reported.
    expect(row).not.toHaveTextContent(/Short by/);
  });

  it("flags a reservation that needs re-checking, and re-checks it (SPM-32 AC04)", async () => {
    listEventEquipmentAvailabilityMock.mockResolvedValue(
      eventWith([
        {
          ...base,
          availableQuantity: 100,
          status: "available",
          reservation: { id: "res-1", quantity: 40, needsRecheck: true, recheckReason: "The event date or time changed", reservedByName: "Tess Support", reservedAt: hours(-1) },
        },
      ]),
    );
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("Needs re-check: The event date or time changed")).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Spring Expo" })).toHaveTextContent("1 of 1 item has an issue");
    await user.click(screen.getByRole("button", { name: "Re-check" }));

    await waitFor(() => expect(changeEquipmentReservationMock).toHaveBeenCalledWith("res-1", 40));
  });

  it("changes a reservation's quantity (SPM-32 AC05)", async () => {
    listEventEquipmentAvailabilityMock.mockResolvedValue(
      eventWith([
        {
          ...base,
          availableQuantity: 100,
          status: "available",
          reservation: { id: "res-1", quantity: 40, needsRecheck: false, recheckReason: null, reservedByName: null, reservedAt: null },
        },
      ]),
    );
    const user = userEvent.setup();
    renderPage();

    await chooseMoreAction(user, "Projector", "Change quantity");
    const dialog = screen.getByRole("dialog", { name: "Change Projector reservation" });
    expect(within(dialog).getByLabelText("Quantity to reserve")).toHaveValue(40);
    await user.clear(within(dialog).getByLabelText("Quantity to reserve"));
    await user.type(within(dialog).getByLabelText("Quantity to reserve"), "30");
    await user.click(within(dialog).getByRole("button", { name: "Save change" }));

    await waitFor(() => expect(changeEquipmentReservationMock).toHaveBeenCalledWith("res-1", 30));
  });

  it("releases a reservation with a reason (SPM-32 AC05)", async () => {
    listEventEquipmentAvailabilityMock.mockResolvedValue(
      eventWith([
        {
          ...base,
          availableQuantity: 100,
          status: "available",
          reservation: { id: "res-1", quantity: 40, needsRecheck: false, recheckReason: null, reservedByName: null, reservedAt: null },
        },
      ]),
    );
    const user = userEvent.setup();
    renderPage();

    await chooseMoreAction(user, "Projector", "Release");
    const dialog = screen.getByRole("dialog", { name: "Release Projector reservation" });
    expect(within(dialog).getByText(/The 40 reserved will return to the available pool/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Reason/), "No longer needed");
    await user.click(within(dialog).getByRole("button", { name: "Release" }));

    await waitFor(() => expect(releaseEquipmentReservationMock).toHaveBeenCalledWith("res-1", "No longer needed"));
    expect(await screen.findByText("Reservation released.")).toBeInTheDocument();
  });

  it("offers no reserve for unknown equipment", async () => {
    listEventEquipmentAvailabilityMock.mockResolvedValue(
      eventWith([{ ...base, equipmentItemId: null, itemCode: null, equipmentName: "Old projector", status: "unknown", availableQuantity: 0 }]),
    );
    renderPage();

    expect(await screen.findByText("Old projector × 50")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reserve" })).not.toBeInTheDocument();
  });
});

describe("EquipmentPage for other roles", () => {
  it("shows the read-only catalogue for a coordinator, with no inventory tabs", async () => {
    authState.profile = { full_name: "Cory Coordinator", role: "event_coordinator" };
    renderPage();

    expect(await screen.findByText("No equipment yet")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Inventory" })).not.toBeInTheDocument();
    expect(service.listEquipmentCatalogue).toHaveBeenCalled();
    expect(service.listInventory).not.toHaveBeenCalled();
  });

  it("lists catalogue items by name, category and in-service quantity for a coordinator", async () => {
    authState.profile = { full_name: "Cory Coordinator", role: "event_coordinator" };
    service.listEquipmentCatalogue.mockResolvedValue([
      { id: "item-mic", name: "Wireless microphone", category: "Audio", code: "mic", totalQuantity: 3, retiredAt: null },
    ]);
    renderPage();

    expect(await screen.findByText("Wireless microphone")).toBeInTheDocument();
    expect(screen.getByText("mic")).toBeInTheDocument();
    expect(screen.getByText("3 in service")).toBeInTheDocument();
  });

  it("filters the coordinator's catalogue by category and search, with a distinct no-match state", async () => {
    authState.profile = { full_name: "Cory Coordinator", role: "event_coordinator" };
    service.listEquipmentCatalogue.mockResolvedValue([
      { id: "item-mic", name: "Wireless microphone", category: "Audio", code: "mic", totalQuantity: 3, retiredAt: null },
      { id: "item-proj", name: "Projector", category: "Visual", code: "proj", totalQuantity: 2, retiredAt: null },
    ]);
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Wireless microphone");
    await user.click(screen.getByRole("radio", { name: "Visual" }));

    expect(screen.getByText("Projector")).toBeInTheDocument();
    expect(screen.queryByText("Wireless microphone")).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "All categories" }));
    await user.type(screen.getByLabelText("Search equipment"), "no such item");

    expect(await screen.findByText("No matching equipment")).toBeInTheDocument();
  });

  describe("Add equipment", () => {
    function EventEquipmentStub() {
      const state = useLocation().state as { openEquipmentRequest?: boolean } | null;
      return <p>EVENT EQUIPMENT PAGE, request open: {String(state?.openEquipmentRequest === true)}</p>;
    }

    function renderCatalogue() {
      return render(
        <MemoryRouter initialEntries={["/equipment"]}>
          <Routes>
            <Route path="equipment" element={<EquipmentPage />} />
            <Route path="events/:eventId/equipment" element={<EventEquipmentStub />} />
          </Routes>
        </MemoryRouter>,
      );
    }

    beforeEach(() => {
      authState.profile = { full_name: "Cory Coordinator", role: "event_coordinator" };
      listAssignedEventsMock.mockReset().mockResolvedValue([
        { id: "event-plan", title: "Planning Gala", status: "planning", startsAt: "2099-03-01T02:00:00.000Z" },
        { id: "event-conf", title: "Confirmed Gala", status: "confirmed", startsAt: "2099-03-02T02:00:00.000Z" },
        { id: "event-req", title: "Requested Gala", status: "requested", startsAt: null },
      ]);
    });

    // Equipment is requested for one event: only the coordinator's own Planning
    // events are offered, and choosing one opens its Add equipment dialog.
    it("asks which of the coordinator's Planning events, then opens its Add equipment", async () => {
      const user = userEvent.setup();
      renderCatalogue();

      await user.click(await screen.findByRole("button", { name: "Add equipment" }));
      const dialog = await screen.findByRole("dialog", { name: "Add equipment to which event?" });
      expect(listAssignedEventsMock).toHaveBeenCalledWith("support-1");
      expect(await within(dialog).findByText("Planning Gala")).toBeInTheDocument();
      expect(within(dialog).queryByText("Confirmed Gala")).not.toBeInTheDocument();
      expect(within(dialog).queryByText("Requested Gala")).not.toBeInTheDocument();

      await user.click(within(dialog).getByRole("button", { name: /Planning Gala/ }));

      expect(await screen.findByText("EVENT EQUIPMENT PAGE, request open: true")).toBeInTheDocument();
    });

    it("says so when none of the coordinator's events are in Planning", async () => {
      listAssignedEventsMock.mockResolvedValue([
        { id: "event-conf", title: "Confirmed Gala", status: "confirmed", startsAt: null },
      ]);
      const user = userEvent.setup();
      renderCatalogue();

      await user.click(await screen.findByRole("button", { name: "Add equipment" }));

      expect(await screen.findByText(/None of your events are in Planning/)).toBeInTheDocument();
      expect(screen.queryByText("Confirmed Gala")).not.toBeInTheDocument();
    });

    it("closes without going anywhere on Cancel", async () => {
      const user = userEvent.setup();
      renderCatalogue();

      await user.click(await screen.findByRole("button", { name: "Add equipment" }));
      await user.click(await screen.findByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add equipment" })).toBeInTheDocument();
    });
  });

  // SPM-74 AC01/AC06: the read-only catalogue offers the same "Show retired"
  // filter as the inventory view.
  it("filters the coordinator's catalogue by 'Show retired'", async () => {
    authState.profile = { full_name: "Cory Coordinator", role: "event_coordinator" };
    service.listEquipmentCatalogue.mockResolvedValue([
      { id: "item-mic", name: "Wireless microphone", category: "Audio", code: "mic", totalQuantity: 3, retiredAt: null },
      { id: "item-proj", name: "Projector", category: "Visual", code: "proj", totalQuantity: 0, retiredAt: hours(-5) },
    ]);
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Wireless microphone");
    expect(screen.queryByText("Projector")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Show retired"));
    expect(screen.getByText("Projector")).toBeInTheDocument();
  });

  // SPM-74 AC03/AC04: chips and "Clear filters" work the same way on the
  // read-only catalogue as on the inventory view.
  it("shows removable chips and a 'Clear filters' action on the coordinator's catalogue", async () => {
    authState.profile = { full_name: "Cory Coordinator", role: "event_coordinator" };
    service.listEquipmentCatalogue.mockResolvedValue([
      { id: "item-mic", name: "Wireless microphone", category: "Audio", code: "mic", totalQuantity: 3, retiredAt: null },
      { id: "item-proj", name: "Projector", category: "Visual", code: "proj", totalQuantity: 2, retiredAt: null },
    ]);
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Wireless microphone");
    await user.click(screen.getByRole("radio", { name: "Visual" }));

    const chip = await screen.findByRole("button", { name: "Remove Visual filter" });
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
    await user.click(chip);

    expect(screen.getByText("Wireless microphone")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Visual filter" })).not.toBeInTheDocument();
  });

  // SPM-74 AC05/AC07: the coordinator catalogue's filters and search persist
  // in the URL and restore from it.
  it("keeps the coordinator catalogue's active filters and search in the URL", async () => {
    authState.profile = { full_name: "Cory Coordinator", role: "event_coordinator" };
    service.listEquipmentCatalogue.mockResolvedValue([
      { id: "item-mic", name: "Wireless microphone", category: "Audio", code: "mic", totalQuantity: 3, retiredAt: null },
      { id: "item-proj", name: "Projector", category: "Visual", code: "proj", totalQuantity: 2, retiredAt: null },
    ]);
    const user = userEvent.setup();
    renderPageWithLocationSpy("/equipment");

    await screen.findByText("Wireless microphone");
    await user.click(screen.getByRole("radio", { name: "Visual" }));
    await user.type(screen.getByLabelText("Search equipment"), "proj");

    expect(lastEquipmentSearch).toContain("category=Visual");
    expect(lastEquipmentSearch).toContain("q=proj");
  });

  it("restores the coordinator catalogue's filters and search from the URL on mount", async () => {
    authState.profile = { full_name: "Cory Coordinator", role: "event_coordinator" };
    service.listEquipmentCatalogue.mockResolvedValue([
      { id: "item-mic", name: "Wireless microphone", category: "Audio", code: "mic", totalQuantity: 3, retiredAt: null },
      { id: "item-proj", name: "Projector", category: "Visual", code: "proj", totalQuantity: 2, retiredAt: null },
    ]);
    renderPage("/equipment?category=Visual&q=proj");

    expect(await screen.findByText("Projector")).toBeInTheDocument();
    expect(screen.queryByText("Wireless microphone")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Search equipment")).toHaveValue("proj");
  });

  it("keeps a coordinator out of the Technical Support Staff inventory page", () => {
    authState.profile = { full_name: "Cory Coordinator", role: "event_coordinator" };
    renderPage("/equipment/inventory");

    expect(screen.getByText("You don't have access to this page")).toBeInTheDocument();
    expect(service.listInventory).not.toHaveBeenCalled();
    expect(service.listEquipmentCatalogue).not.toHaveBeenCalled();
  });
});

/** ISO -> the Singapore-local value a datetime-local input takes. */
function toLocal(iso: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const field = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${field("year")}-${field("month")}-${field("day")}T${field("hour")}:${field("minute")}`;
}

describe("EquipmentPage arrangement status (SPM-28)", () => {
  const base = {
    requirementId: "req-proj",
    equipmentItemId: PROJ,
    equipmentName: "Projector",
    itemCode: "proj",
    itemRetired: false,
    requestedQuantity: 5,
    requiredFrom: hours(24),
    requiredUntil: hours(28),
    technicalRequirements: "HDMI input",
    totalUnits: 100,
    reservedQuantity: 0,
    availableQuantity: 100,
    status: "available",
    reservation: null as null | Record<string, unknown>,
    arrangement: NOT_STARTED as Record<string, unknown>,
  };
  const eventWith = (results: Array<Record<string, unknown>>, status = "planning") => [
    { id: "event-expo", title: "Spring Expo", status, startsAt: hours(24), endsAt: hours(28), results },
  ];
  const updated = {
    status: "arranged",
    updatedByName: "Lee Support",
    updatedAt: "2099-01-02T03:00:00Z",
    history: [
      { id: 1, status: "in_progress", note: "Reserved 2 of 5", updatedByName: "Tess Support", updatedAt: "2099-01-01T02:00:00Z" },
      { id: 2, status: "issue", note: "Request changed", updatedByName: "Lee Support", updatedAt: "2099-01-01T05:00:00Z" },
      { id: 3, status: "arranged", note: "Reserved 5 of 5", updatedByName: "Lee Support", updatedAt: "2099-01-02T03:00:00Z" },
    ],
  };

  // AC02: nothing has happened to it yet.
  it("shows Not started for an item nobody has updated", async () => {
    listEventEquipmentAvailabilityMock.mockResolvedValue(eventWith([base]));
    renderPage();

    const row = (await screen.findByText("Projector × 5")).closest("li")!;
    expect(within(row).getByText("Arrangement: Not started")).toBeInTheDocument();
    expect(within(row).queryByText(/Arrangement history/)).not.toBeInTheDocument();
  });

  // AC03: the status, who last updated it and when, and every update in order.
  it("shows the current status, who updated it, and the history in order", async () => {
    listEventEquipmentAvailabilityMock.mockResolvedValue(eventWith([{ ...base, arrangement: updated, reservation: { id: "res-1", quantity: 5, needsRecheck: false, recheckReason: null, reservedByName: "Tess Support", reservedAt: hours(-2) } }]));
    renderPage();
    await showTab("Arranged");

    const row = (await screen.findByText("Projector × 5")).closest("li")!;
    expect(within(row).getByText("Arrangement: Arranged")).toBeInTheDocument();
    expect(within(row).queryByText(/Arrangement note/)).not.toBeInTheDocument();
    expect(within(row).getByText(/Updated by Lee Support · 2 Jan 2099/)).toBeInTheDocument();
    expect(within(row).getByText("Arrangement history (3)")).toBeInTheDocument();
    const entries = within(row).getAllByRole("listitem").map((item) => item.textContent);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatch(/^In progress · Reserved 2 of 5 · .* · Tess Support$/);
    expect(entries[1]).toMatch(/^Issue · Request changed/);
    expect(entries[2]).toMatch(/^Arranged · Reserved 5 of 5/);
  });

  // AC04-AC06 (removed): nobody sets a status or note by hand any more.
  it("offers no way to report an issue, resolve it or add a note", async () => {
    listEventEquipmentAvailabilityMock.mockResolvedValue(
      eventWith([{ ...base, arrangement: updated, reservation: { id: "res-1", quantity: 5, needsRecheck: false, recheckReason: null, reservedByName: "Tess Support", reservedAt: hours(-2) } }]),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "More actions for Projector" }));
    expect((await screen.findAllByRole("menuitem")).map((item) => item.textContent)).toEqual(["Change quantity", "Release"]);
    expect(screen.queryByRole("button", { name: "Resolve issue" })).not.toBeInTheDocument();
  });

  it("still shows the event requests when the arrangement statuses can't be loaded", async () => {
    listEventEquipmentAvailabilityMock.mockResolvedValue(eventWith([{ ...base, arrangement: null }]));
    renderPage();

    const row = (await screen.findByText("Projector × 5")).closest("li")!;
    expect(within(row).getByText("Arrangement status unavailable")).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /Set status/ })).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /More actions/ })).not.toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Reserve" })).toBeInTheDocument();
  });

  it("lists Pending Safety Check events for arranging, allowing only Release", async () => {
    listEventEquipmentAvailabilityMock.mockResolvedValue(
      eventWith(
        [
          base,
          {
            ...base,
            requirementId: "req-mic",
            equipmentName: "Microphone",
            reservation: { id: "res-1", quantity: 5, needsRecheck: true, recheckReason: "The event date or time changed", reservedByName: null, reservedAt: null },
          },
        ],
        "pending_safety_check",
      ),
    );
    const user = userEvent.setup();
    renderPage();

    // Arrangements are frozen for the review: nothing to reserve or re-check.
    expect(await screen.findByRole("button", { name: "More actions for Microphone" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Reserve/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Re-check" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More actions for Projector" })).not.toBeInTheDocument();
    // Releasing only gives units back, so it stays available; changing does not.
    await user.click(screen.getByRole("button", { name: "More actions for Microphone" }));
    expect((await screen.findAllByRole("menuitem")).map((item) => item.textContent)).toEqual(["Release"]);
    expect(
      screen.getAllByText("Can't reserve or change while the event awaits its safety check"),
    ).toHaveLength(2);
  });
});
