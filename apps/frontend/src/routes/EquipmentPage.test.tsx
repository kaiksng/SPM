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

const service = {
  listInventory: vi.fn(),
  listEquipmentCatalogue: vi.fn(),
  listEquipmentUnavailability: vi.fn(),
  listOverlappingReservations: vi.fn(),
  recordEquipmentUnavailability: vi.fn(),
  endEquipmentUnavailability: vi.fn(),
  removeEquipmentUnavailability: vi.fn(),
  createEquipmentItem: vi.fn(),
  updateEquipmentItem: vi.fn(),
  addEquipmentUnits: vi.fn(),
  setEquipmentUnitRetired: vi.fn(),
  setEquipmentItemRetired: vi.fn(),
};

vi.mock("@/features/equipment/services/equipment-unavailability", () => ({
  listInventory: (...args: unknown[]) => service.listInventory(...args),
  listEquipmentCatalogue: (...args: unknown[]) => service.listEquipmentCatalogue(...args),
  listEquipmentUnavailability: (...args: unknown[]) => service.listEquipmentUnavailability(...args),
  listOverlappingReservations: (...args: unknown[]) => service.listOverlappingReservations(...args),
  recordEquipmentUnavailability: (...args: unknown[]) => service.recordEquipmentUnavailability(...args),
  endEquipmentUnavailability: (...args: unknown[]) => service.endEquipmentUnavailability(...args),
  removeEquipmentUnavailability: (...args: unknown[]) => service.removeEquipmentUnavailability(...args),
  createEquipmentItem: (...args: unknown[]) => service.createEquipmentItem(...args),
  updateEquipmentItem: (...args: unknown[]) => service.updateEquipmentItem(...args),
  addEquipmentUnits: (...args: unknown[]) => service.addEquipmentUnits(...args),
  setEquipmentUnitRetired: (...args: unknown[]) => service.setEquipmentUnitRetired(...args),
  setEquipmentItemRetired: (...args: unknown[]) => service.setEquipmentItemRetired(...args),
}));

const updateEquipmentArrangementMock = vi.fn();
vi.mock("@/features/equipment/services/equipment-arrangement-status", () => ({
  updateEquipmentArrangement: (...args: unknown[]) => updateEquipmentArrangementMock(...args),
}));

/** SPM-28: an item nobody has updated yet. */
const NOT_STARTED = { status: "not_started", note: null, updatedByName: null, updatedAt: null, history: [] };

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

const inProgress = {
  id: "record-current",
  equipmentItemId: MIC,
  equipmentName: "Wireless microphone",
  quantity: 1,
  unitIds: [`${MIC}-unit-2`],
  reason: "Battery fault",
  startsAt: hours(-2),
  endsAt: hours(48),
  recordedAt: hours(-3),
  recordedByName: "Sam Support",
  endedAt: null,
  endedByName: null,
  removedAt: null,
  removedByName: null,
};
const removed = {
  ...inProgress,
  id: "record-removed",
  unitIds: [],
  reason: "Entered by mistake",
  startsAt: hours(24),
  endsAt: hours(30),
  removedAt: hours(-1),
  removedByName: "Tess Support",
};

/** Technical Support Staff sections are separate pages: /equipment, /equipment/inventory, /equipment/unavailability. */
function renderPage(path = "/equipment") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="equipment" element={<EquipmentPage />} />
        <Route path="equipment/inventory" element={<EquipmentPage section="inventory" />} />
        <Route path="equipment/unavailability" element={<EquipmentPage section="unavailability" />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Unavailability is its own page; waits for it to load. */
async function renderUnavailability() {
  renderPage("/equipment/unavailability");
  await screen.findByRole("heading", { name: "Unavailability records" });
}

/** Event requests are sorted into tabs by arrangement status (SPM-28). */
async function showTab(name: "Not started" | "In progress" | "Arranged" | "Issue") {
  await userEvent.setup().click(await screen.findByRole("tab", { name: new RegExp(`^${name}`) }));
}

/** The form is behind the "Record unavailability" button. */
async function openRecordForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /Record unavailability/ }));
  return screen.getByRole("dialog", { name: "Record equipment as unavailable" });
}

beforeEach(() => {
  authState.profile = { full_name: "Tess Support", role: "technical_support_staff" };
  for (const mock of Object.values(service)) mock.mockReset().mockResolvedValue(undefined);
  service.listInventory.mockResolvedValue(inventory());
  service.listEquipmentCatalogue.mockResolvedValue([]);
  service.listEquipmentUnavailability.mockResolvedValue([inProgress, removed]);
  service.listOverlappingReservations.mockResolvedValue([]);
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
  it("summarises equipment types and what is out of service", async () => {
    await renderInventory();

    expect((await screen.findByText("Equipment types")).nextSibling).toHaveTextContent("2");
    expect(screen.getByText("Out of service now").nextSibling).toHaveTextContent("1");
    expect(screen.queryByText("Available now", { selector: "p" })).not.toBeInTheDocument();
    expect(screen.queryByText("Retired types")).not.toBeInTheDocument();
  });

  it("opens the records in progress from the out-of-service card", async () => {
    const user = userEvent.setup();
    await renderInventory();

    await user.click(await screen.findByRole("button", { name: /Out of service now: 1/ }));

    expect(await screen.findByRole("heading", { name: "Unavailability" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "In progress 1" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Battery fault")).toBeInTheDocument();
    expect(screen.queryByText("Entered by mistake")).not.toBeInTheDocument();
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

  it("lists each unit by ID with the out-of-service one flagged", async () => {
    const user = userEvent.setup();
    await renderInventory();

    await user.click(await screen.findByRole("button", { name: "Show Wireless microphone units" }));
    const grid = screen.getByRole("list", { name: "Wireless microphone units" });
    expect(within(grid).getByRole("button", { name: "mic-1" })).toBeInTheDocument();
    expect(within(grid).getByRole("button", { name: "mic-2" })).toHaveAttribute("title", "Out: Battery fault");

    await user.click(within(grid).getByRole("button", { name: "mic-2" }));
    const dialog = screen.getByRole("dialog", { name: "mic-2 · Wireless microphone" });
    expect(within(dialog).getByText("Out of service")).toBeInTheDocument();
    expect(within(dialog).getByText(/Battery fault · until/)).toBeInTheDocument();
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

  it("marks a unit unavailable from its dialog, with the unit already chosen", async () => {
    const user = userEvent.setup();
    await renderInventory();

    await user.click(await screen.findByRole("button", { name: "Show Wireless microphone units" }));
    await user.click(screen.getByRole("button", { name: "mic-3" }));
    await user.click(screen.getByRole("button", { name: /Mark unavailable/ }));

    const dialog = screen.getByRole("dialog", { name: "mic-3 · Wireless microphone" });
    expect(within(dialog).getByLabelText("Equipment")).toHaveValue(MIC);
    expect(within(dialog).getByRole("checkbox", { name: "mic-3" })).toBeChecked();
    await user.type(within(dialog).getByLabelText("Unavailable from"), "2099-04-10T09:00");
    await user.type(within(dialog).getByLabelText("Unavailable until"), "2099-04-12T09:00");
    await user.type(within(dialog).getByLabelText("Reason"), "Cracked casing");
    await user.click(within(dialog).getByRole("button", { name: /Mark mic-3 unavailable/ }));

    await waitFor(() =>
      expect(service.recordEquipmentUnavailability).toHaveBeenCalledWith(
        expect.objectContaining({ equipmentItemId: MIC, unitIds: [`${MIC}-unit-3`], reason: "Cracked casing" }),
      ),
    );
    expect(await screen.findByText("Unavailability recorded.")).toBeInTheDocument();
  });

  it("selects several units, including a shift-click range, and marks them unavailable together", async () => {
    const user = userEvent.setup();
    await renderInventory();

    await user.click(await screen.findByRole("button", { name: "Show Wireless microphone units" }));
    await user.click(screen.getByRole("button", { name: "Select units" }));
    await user.click(screen.getByRole("button", { name: "mic-1" }));
    await user.keyboard("{Shift>}");
    await user.click(screen.getByRole("button", { name: "mic-3" }));
    await user.keyboard("{/Shift}");

    expect(screen.getByText("3 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "mic-2" })).toHaveAttribute("aria-pressed", "true");
    // In selection mode a click selects; it does not open the unit dialog.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mark 3 unavailable" }));
    const dialog = screen.getByRole("dialog", { name: "Mark 3 Wireless microphone units unavailable" });
    for (const label of ["mic-1", "mic-2", "mic-3"]) {
      expect(within(dialog).getByRole("checkbox", { name: label })).toBeChecked();
    }
    expect(within(dialog).getByLabelText("Quantity unavailable")).toHaveValue(3);
    await user.type(within(dialog).getByLabelText("Unavailable from"), "2099-04-10T09:00");
    await user.type(within(dialog).getByLabelText("Unavailable until"), "2099-04-12T09:00");
    await user.type(within(dialog).getByLabelText("Reason"), "Firmware update");
    await user.click(within(dialog).getByRole("button", { name: "Mark 3 unavailable" }));

    await waitFor(() =>
      expect(service.recordEquipmentUnavailability).toHaveBeenCalledWith(
        expect.objectContaining({
          equipmentItemId: MIC,
          unitIds: [`${MIC}-unit-1`, `${MIC}-unit-2`, `${MIC}-unit-3`],
        }),
      ),
    );
    // The finished selection is cleared, so nothing stays selected.
    expect(await screen.findByRole("button", { name: "Select units" })).toBeInTheDocument();
    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mark d+ unavailable/ })).not.toBeInTheDocument();
  });

  it("selects all shown units, skipping retired ones, and can clear them", async () => {
    const items = inventory();
    items[0]!.units[2]!.retiredAt = hours(-5);
    service.listInventory.mockResolvedValue(items);
    const user = userEvent.setup();
    await renderInventory();

    await user.click(await screen.findByRole("button", { name: "Show Wireless microphone units" }));
    await user.click(screen.getByRole("button", { name: "Select units" }));
    expect(screen.getByRole("button", { name: "mic-3" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Select all shown" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByText("0 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark 0 unavailable" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Done selecting" }));
    expect(screen.queryByText("0 selected")).not.toBeInTheDocument();
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

describe("EquipmentPage unavailability (SPM-30)", () => {
  it("identifies each missing field and does not save (AC01)", async () => {
    const user = userEvent.setup();
    await renderUnavailability();
    const form = await openRecordForm(user);

    await user.clear(within(form).getByLabelText("Quantity unavailable"));
    await user.click(within(form).getByRole("button", { name: /Record unavailability/ }));

    expect(await within(form).findByText("Choose equipment from the catalogue")).toBeInTheDocument();
    expect(within(form).getByText("Enter a quantity")).toBeInTheDocument();
    expect(within(form).getByText("Enter a reason")).toBeInTheDocument();
    expect(within(form).getAllByText("Enter a date and time")).toHaveLength(2);
    expect(service.recordEquipmentUnavailability).not.toHaveBeenCalled();
  });

  it("requires the end to be after the start (AC02)", async () => {
    const user = userEvent.setup();
    await renderUnavailability();
    const form = await openRecordForm(user);

    await user.selectOptions(within(form).getByLabelText("Equipment"), PROJ);
    await user.type(within(form).getByLabelText("Unavailable from"), "2099-04-10T12:00");
    await user.type(within(form).getByLabelText("Unavailable until"), "2099-04-10T09:00");
    await user.type(within(form).getByLabelText("Reason"), "Repair");
    await user.click(within(form).getByRole("button", { name: /Record unavailability/ }));

    expect(await within(form).findByText("End time must be after start time")).toBeInTheDocument();
    expect(service.recordEquipmentUnavailability).not.toHaveBeenCalled();
  });

  it("does not offer retired items", async () => {
    const user = userEvent.setup();
    await renderUnavailability();
    const form = await openRecordForm(user);

    expect(within(form).queryByRole("option", { name: "Overhead projector" })).not.toBeInTheDocument();
  });

  it("shows overlapping records and reservations before saving (AC03)", async () => {
    service.listOverlappingReservations.mockResolvedValue([
      { id: "reservation-1", quantity: 3, status: "approved", startsAt: hours(1), endsAt: hours(5), eventTitle: "Orientation Day" },
    ]);
    const user = userEvent.setup();
    await renderUnavailability();
    const form = await openRecordForm(user);

    await user.selectOptions(within(form).getByLabelText("Equipment"), MIC);
    await user.type(within(form).getByLabelText("Unavailable from"), toLocal(hours(1)));
    await user.type(within(form).getByLabelText("Unavailable until"), toLocal(hours(6)));

    const panel = await within(form).findByRole("region", { name: "Overlaps for this period" });
    expect(within(panel).getByText(/3 units in service/)).toBeInTheDocument();
    expect(within(panel).getByText(/Unavailable × 1/)).toBeInTheDocument();
    expect(within(panel).queryByText(/Entered by mistake/)).not.toBeInTheDocument();
    expect(await within(panel).findByText(/Confirmed reservation × 3/)).toBeInTheDocument();
    // mic-2 is already out for this period, so it cannot be chosen again.
    expect(within(form).getByRole("checkbox", { name: "mic-2" })).toBeDisabled();
  });

  it("records an outage for specific units", async () => {
    const user = userEvent.setup();
    await renderUnavailability();
    const form = await openRecordForm(user);

    await user.selectOptions(within(form).getByLabelText("Equipment"), PROJ);
    await user.click(within(form).getByRole("checkbox", { name: "proj-1" }));
    await user.click(within(form).getByRole("checkbox", { name: "proj-2" }));
    expect(within(form).getByLabelText("Quantity unavailable")).toHaveValue(2);
    expect(within(form).getByLabelText("Quantity unavailable")).toBeDisabled();
    await user.type(within(form).getByLabelText("Unavailable from"), "2099-04-10T09:00");
    await user.type(within(form).getByLabelText("Unavailable until"), "2099-04-12T09:00");
    await user.type(within(form).getByLabelText("Reason"), "Lamp replacement");
    await user.click(within(form).getByRole("button", { name: /Record unavailability/ }));

    await waitFor(() =>
      expect(service.recordEquipmentUnavailability).toHaveBeenCalledWith(
        expect.objectContaining({ equipmentItemId: PROJ, unitIds: [`${PROJ}-unit-1`, `${PROJ}-unit-2`] }),
      ),
    );
    expect(await screen.findByText("Unavailability recorded.")).toBeInTheDocument();
  });

  it("records an outage by quantity alone", async () => {
    const user = userEvent.setup();
    await renderUnavailability();
    const form = await openRecordForm(user);

    await user.selectOptions(within(form).getByLabelText("Equipment"), PROJ);
    await user.type(within(form).getByLabelText("Unavailable from"), "2099-04-10T09:00");
    await user.type(within(form).getByLabelText("Unavailable until"), "2099-04-12T09:00");
    await user.type(within(form).getByLabelText("Reason"), "Lamp replacement");
    await user.click(within(form).getByRole("button", { name: /Record unavailability/ }));

    await waitFor(() =>
      expect(service.recordEquipmentUnavailability).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: "1", unitIds: [] }),
      ),
    );
  });

  it("lists the records first, with the form behind a button", async () => {
    const user = userEvent.setup();
    await renderUnavailability();

    expect(screen.getByRole("heading", { name: "Unavailability records" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Reason")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All 2" })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps who recorded and removed each record, and the units named (AC06)", async () => {
    const user = userEvent.setup();
    await renderUnavailability();

    expect(screen.getAllByText(/Recorded .* by Sam Support/)).toHaveLength(2);
    expect(screen.getByText(/Removed .* by Tess Support/)).toBeInTheDocument();
    expect(screen.getByText("Units: mic-2")).toBeInTheDocument();
  });

  it("ends an in-progress record after confirmation (AC05)", async () => {
    const user = userEvent.setup();
    await renderUnavailability();

    await user.click(screen.getByRole("button", { name: "End now" }));
    const dialog = screen.getByRole("dialog", { name: "Return to service now?" });
    await user.click(within(dialog).getByRole("button", { name: "End now" }));

    await waitFor(() => expect(service.endEquipmentUnavailability).toHaveBeenCalledWith("record-current"));
    expect(await screen.findByText("Equipment returned to service.")).toBeInTheDocument();
  });

  // SPM-30 AC05: a record entered for a period that has not started can be removed.
  it("removes an upcoming record after confirmation (AC05)", async () => {
    const upcoming = { ...inProgress, id: "record-upcoming", reason: "Booked for servicing", startsAt: hours(24), endsAt: hours(30) };
    service.listEquipmentUnavailability.mockResolvedValue([upcoming]);
    const user = userEvent.setup();
    await renderUnavailability();

    await user.click(await screen.findByRole("button", { name: "Remove" }));
    const dialog = screen.getByRole("dialog", { name: "Remove this record?" });
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(service.removeEquipmentUnavailability).toHaveBeenCalledWith("record-upcoming"));
    expect(await screen.findByText("Record removed.")).toBeInTheDocument();
  });

  // SPM-30 AC05: cancelling the confirmation changes nothing.
  it("does not remove a record when the confirmation is cancelled", async () => {
    const upcoming = { ...inProgress, id: "record-upcoming", startsAt: hours(24), endsAt: hours(30) };
    service.listEquipmentUnavailability.mockResolvedValue([upcoming]);
    const user = userEvent.setup();
    await renderUnavailability();

    await user.click(await screen.findByRole("button", { name: "Remove" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(service.removeEquipmentUnavailability).not.toHaveBeenCalled();
  });

  // SPM-30 AC01: the quantity must be a positive whole number.
  it.each(["0", "1.5"])("refuses a quantity of %s without saving (AC01)", async (quantity) => {
    const user = userEvent.setup();
    await renderUnavailability();
    const form = await openRecordForm(user);

    await user.clear(within(form).getByLabelText("Quantity unavailable"));
    await user.type(within(form).getByLabelText("Quantity unavailable"), quantity);
    await user.click(within(form).getByRole("button", { name: /Record unavailability/ }));

    expect(await within(form).findByText("Enter a positive whole number")).toBeInTheDocument();
    expect(service.recordEquipmentUnavailability).not.toHaveBeenCalled();
  });

  it("filters records by status and strikes through cancelled ones", async () => {
    const user = userEvent.setup();
    await renderUnavailability();

    expect(screen.getByText("Entered by mistake").closest("div")).toHaveClass("line-through");
    expect(screen.getByText("Battery fault").closest("div")).not.toHaveClass("line-through");

    await user.click(screen.getByRole("button", { name: "Removed 1" }));
    expect(screen.getByText("Entered by mistake")).toBeInTheDocument();
    expect(screen.queryByText("Battery fault")).not.toBeInTheDocument();
  });

  it("offers no actions on a removed record", async () => {
    service.listEquipmentUnavailability.mockResolvedValue([removed]);
    const user = userEvent.setup();
    await renderUnavailability();

    expect(screen.getByText(/Entered by mistake/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "End now" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
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
    unavailableQuantity: 0,
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
          result({ requirementId: "r1", technicalRequirements: "HDMI input", reservedQuantity: 40, unavailableQuantity: 30 }),
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

  // SPM-28: tabs follow the arrangement status; nobody has started on these yet.
  it("opens on Not started, counting each arrangement status", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Event requests" })).toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: /^Not started/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Not started5",
      "In progress0",
      "Arranged0",
      "Issue0",
    ]);
    // The event header still summarises all of its items.
    expect(await screen.findByRole("listitem", { name: "Annual Gala" })).toHaveTextContent("3 of 4 items need attention");
    expect(screen.getByRole("listitem", { name: "Tech Talk" })).toHaveTextContent("All equipment available");
  });

  it("sorts each item into the tab for its arrangement status", async () => {
    const started = (status: string) => ({
      status,
      note: null,
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

    const notStarted = await screen.findByRole("listitem", { name: "Annual Gala" });
    expect(within(notStarted).getByText("Projector × 3")).toBeInTheDocument();
    expect(within(notStarted).queryByText(/Smoke machine/)).not.toBeInTheDocument();

    await showTab("Issue");
    const issue = await screen.findByRole("listitem", { name: "Annual Gala" });
    expect(within(issue).getByText("Smoke machine × 3")).toBeInTheDocument();
    expect(within(issue).queryByText("Projector × 3")).not.toBeInTheDocument();

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
    expect(projector).toHaveTextContent("100 in service · 40 reserved · 30 out of service during this period");

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

  it("identifies unknown equipment instead of treating it as available (AC05)", async () => {
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
    unavailableQuantity: 0,
    availableQuantity: 40,
    status: "partially_available",
    reservation: null as null | Record<string, unknown>,
    arrangement: NOT_STARTED as Record<string, unknown>,
  };
  const eventWith = (results: Array<Record<string, unknown>>) => [
    { id: "event-expo", title: "Spring Expo", status: "planning", startsAt: hours(24), endsAt: hours(28), results },
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

  it("reserves an item, defaulting to what can be provided (SPM-32 AC01)", async () => {
    listEventEquipmentAvailabilityMock.mockResolvedValue(eventWith([base]));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Reserve" }));
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

    await user.click(await screen.findByRole("button", { name: "Reserve" }));
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

  it("shows who reserved what, and offers change and release instead of reserve", async () => {
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
    renderPage();

    expect(await screen.findByText(/Reserved 40 of 50 by Tess Support/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reserve" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Release" })).toBeInTheDocument();
    expect(screen.getByText("1 of 1 reserved")).toBeInTheDocument();
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
    expect(row).toHaveTextContent("100 in service · 50 reserved · 0 out of service during this period");
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
    expect(screen.getByRole("listitem", { name: "Spring Expo" })).toHaveTextContent("1 of 1 item need attention");
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

    await user.click(await screen.findByRole("button", { name: "Change" }));
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

    await user.click(await screen.findByRole("button", { name: "Release" }));
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
    unavailableQuantity: 0,
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
    note: "Delivered to Hall A",
    updatedByName: "Lee Support",
    updatedAt: "2099-01-02T03:00:00Z",
    history: [
      { id: 1, status: "in_progress", note: "Sourcing from Block B", updatedByName: "Tess Support", updatedAt: "2099-01-01T02:00:00Z" },
      { id: 2, status: "issue", note: "One faulty", updatedByName: "Lee Support", updatedAt: "2099-01-01T05:00:00Z" },
      { id: 3, status: "arranged", note: "Delivered to Hall A", updatedByName: "Lee Support", updatedAt: "2099-01-02T03:00:00Z" },
    ],
  };

  beforeEach(() => {
    updateEquipmentArrangementMock.mockReset();
    updateEquipmentArrangementMock.mockResolvedValue(true);
  });

  // AC02: never updated.
  it("shows Not started for an item nobody has updated", async () => {
    listEventEquipmentAvailabilityMock.mockResolvedValue(eventWith([base]));
    renderPage();

    const row = (await screen.findByText("Projector × 5")).closest("li")!;
    expect(within(row).getByText("Arrangement: Not started")).toBeInTheDocument();
    expect(within(row).queryByText(/Arrangement history/)).not.toBeInTheDocument();
  });

  // AC01/AC04: choose from the fixed list, add a note, save.
  it("updates the status and note and shows a confirmation", async () => {
    listEventEquipmentAvailabilityMock.mockResolvedValue(eventWith([base]));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Update arrangement" }));
    const dialog = screen.getByRole("dialog", { name: "Update Projector arrangement" });
    const status = within(dialog).getByLabelText("Arrangement status");
    expect(within(status).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Not started",
      "In progress",
      "Arranged",
      "Issue",
    ]);
    await user.selectOptions(status, "Issue");
    await user.type(within(dialog).getByLabelText(/Note/), "  One projector is faulty ");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateEquipmentArrangementMock).toHaveBeenCalledWith("req-proj", {
        status: "issue",
        note: "One projector is faulty",
      }),
    );
    expect(await screen.findByText("Arrangement updated.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // The list reloads to show the saved values.
    expect(listEventEquipmentAvailabilityMock).toHaveBeenCalledTimes(2);
  });

  // AC03/AC04/AC05: current values, who and when, and every earlier update in order.
  it("shows the current status and note, who updated it, and the history in order", async () => {
    listEventEquipmentAvailabilityMock.mockResolvedValue(eventWith([{ ...base, arrangement: updated }]));
    renderPage();
    await showTab("Arranged");

    const row = (await screen.findByText("Projector × 5")).closest("li")!;
    expect(within(row).getByText("Arrangement: Arranged")).toBeInTheDocument();
    expect(within(row).getByText(/Delivered to Hall A/, { selector: "p" })).toBeInTheDocument();
    expect(within(row).getByText(/Updated by Lee Support · 2 Jan 2099/)).toBeInTheDocument();
    expect(within(row).getByText("Arrangement history (3)")).toBeInTheDocument();
    const entries = within(row).getAllByRole("listitem").map((item) => item.textContent);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatch(/^In progress · Sourcing from Block B · .* · Tess Support$/);
    expect(entries[1]).toMatch(/^Issue · One faulty/);
    expect(entries[2]).toMatch(/^Arranged · Delivered to Hall A/);
  });

  // AC05: opening again starts from the current values.
  it("opens the update on the current status and note", async () => {
    listEventEquipmentAvailabilityMock.mockResolvedValue(eventWith([{ ...base, arrangement: updated }]));
    const user = userEvent.setup();
    renderPage();
    await showTab("Arranged");

    await user.click(await screen.findByRole("button", { name: "Update arrangement" }));
    const dialog = screen.getByRole("dialog", { name: "Update Projector arrangement" });
    expect(within(dialog).getByLabelText("Arrangement status")).toHaveValue("arranged");
    expect(within(dialog).getByLabelText(/Note/)).toHaveValue("Delivered to Hall A");
  });

  it("says so when nothing changed", async () => {
    listEventEquipmentAvailabilityMock.mockResolvedValue(eventWith([base]));
    updateEquipmentArrangementMock.mockResolvedValue(false);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Update arrangement" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }));

    expect(await screen.findByText("No changes to save.")).toBeInTheDocument();
  });

  it("refuses a note over 1000 characters without saving", async () => {
    listEventEquipmentAvailabilityMock.mockResolvedValue(eventWith([base]));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Update arrangement" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByLabelText(/Note/));
    await user.paste("a".repeat(1001));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByText("Note must contain at most 1000 characters")).toBeInTheDocument();
    expect(updateEquipmentArrangementMock).not.toHaveBeenCalled();
  });

  // AC06: the database's refusal is shown, and nothing is reported as saved.
  it("shows a refusal from the database in the dialog", async () => {
    listEventEquipmentAvailabilityMock.mockResolvedValue(eventWith([base]));
    updateEquipmentArrangementMock.mockRejectedValue(
      new Error("Only Technical Support Staff can update equipment arrangements"),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Update arrangement" }));
    const dialog = screen.getByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText("Arrangement status"), "Arranged");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(
      await within(dialog).findByText("Only Technical Support Staff can update equipment arrangements"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Arrangement updated.")).not.toBeInTheDocument();
  });

  it("still shows the event requests when the arrangement statuses can't be loaded", async () => {
    listEventEquipmentAvailabilityMock.mockResolvedValue(eventWith([{ ...base, arrangement: null }]));
    renderPage();

    const row = (await screen.findByText("Projector × 5")).closest("li")!;
    expect(within(row).getByText("Arrangement status unavailable")).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Update arrangement" })).not.toBeInTheDocument();
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
    renderPage();

    expect(await screen.findAllByRole("button", { name: "Update arrangement" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Reserve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Re-check" })).not.toBeInTheDocument();
    // Releasing only gives units back, so it stays available.
    expect(screen.getByRole("button", { name: "Release" })).toBeInTheDocument();
    expect(
      screen.getAllByText("Can't reserve or change while the event awaits its safety check"),
    ).toHaveLength(2);
  });
});
