import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/equipment"]}>
      <EquipmentPage />
    </MemoryRouter>,
  );
}

async function openUnavailabilityTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("tab", { name: /Unavailability/ }));
}

/** The form is behind the "Record unavailability" button. */
async function openRecordForm(user: ReturnType<typeof userEvent.setup>) {
  await openUnavailabilityTab(user);
  await user.click(screen.getByRole("button", { name: /Record unavailability/ }));
  return screen.getByRole("dialog", { name: "Record equipment as unavailable" });
}

beforeEach(() => {
  authState.profile = { full_name: "Tess Support", role: "technical_support_staff" };
  for (const mock of Object.values(service)) mock.mockReset().mockResolvedValue(undefined);
  service.listInventory.mockResolvedValue(inventory());
  service.listEquipmentUnavailability.mockResolvedValue([inProgress, removed]);
  service.listOverlappingReservations.mockResolvedValue([]);
});

describe("EquipmentPage inventory for Technical Support Staff", () => {
  it("summarises equipment types and what is out of service", async () => {
    renderPage();

    expect((await screen.findByText("Equipment types")).nextSibling).toHaveTextContent("2");
    expect(screen.getByText("Out of service now").nextSibling).toHaveTextContent("1");
    expect(screen.queryByText("Available now", { selector: "p" })).not.toBeInTheDocument();
    expect(screen.queryByText("Retired types")).not.toBeInTheDocument();
  });

  it("opens the records in progress from the out-of-service card", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /Out of service now: 1/ }));

    expect(screen.getByRole("tab", { name: /Unavailability/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "In progress 1" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Battery fault")).toBeInTheDocument();
    expect(screen.queryByText("Entered by mistake")).not.toBeInTheDocument();
  });

  it("groups items by category and hides retired items until asked", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("region", { name: "Audio" })).toHaveTextContent("Wireless microphone");
    expect(screen.queryByText("Overhead projector")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Show retired"));
    expect(screen.getByText("Overhead projector")).toBeInTheDocument();
  });

  it("finds an item by name, code or unit ID", async () => {
    const user = userEvent.setup();
    renderPage();

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
    renderPage();

    await user.selectOptions(await screen.findByLabelText("Filter by category"), "Visual");
    expect(screen.getByText("Projector")).toBeInTheDocument();
    expect(screen.queryByText("Wireless microphone")).not.toBeInTheDocument();
  });

  it("lists each unit by ID with the out-of-service one flagged", async () => {
    const user = userEvent.setup();
    renderPage();

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
    renderPage();

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
    renderPage();

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

  it("shows a retired unit struck through", async () => {
    const items = inventory();
    items[0]!.units[0]!.retiredAt = hours(-5);
    service.listInventory.mockResolvedValue(items);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Show Wireless microphone units" }));
    expect(screen.getByRole("button", { name: "mic-1" })).toHaveClass("line-through");
  });

  it("adds units after the highest existing one", async () => {
    const user = userEvent.setup();
    renderPage();

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
    renderPage();

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
    renderPage();

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
    renderPage();

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
    renderPage();

    const row = (await screen.findByText("Projector")).closest("li")!;
    await user.click(within(row).getByRole("button", { name: "Retire" }));
    const confirm = screen.getByRole("dialog", { name: "Retire Projector?" });
    expect(service.setEquipmentItemRetired).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole("button", { name: "Retire Projector" }));

    await waitFor(() => expect(service.setEquipmentItemRetired).toHaveBeenCalledWith(PROJ, true));
  });

  it("does not retire an item when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    renderPage();

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
    renderPage();
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
    renderPage();
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
    renderPage();
    const form = await openRecordForm(user);

    expect(within(form).queryByRole("option", { name: "Overhead projector" })).not.toBeInTheDocument();
  });

  it("shows overlapping records and reservations before saving (AC03)", async () => {
    service.listOverlappingReservations.mockResolvedValue([
      { id: "reservation-1", quantity: 3, status: "approved", startsAt: hours(1), endsAt: hours(5), eventTitle: "Orientation Day" },
    ]);
    const user = userEvent.setup();
    renderPage();
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
    renderPage();
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
    renderPage();
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
    renderPage();
    await openUnavailabilityTab(user);

    expect(screen.getByRole("heading", { name: "Unavailability records" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Reason")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All 2" })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps who recorded and removed each record, and the units named (AC06)", async () => {
    const user = userEvent.setup();
    renderPage();
    await openUnavailabilityTab(user);

    expect(screen.getAllByText(/Recorded .* by Sam Support/)).toHaveLength(2);
    expect(screen.getByText(/Removed .* by Tess Support/)).toBeInTheDocument();
    expect(screen.getByText("Units: mic-2")).toBeInTheDocument();
  });

  it("ends an in-progress record after confirmation (AC05)", async () => {
    const user = userEvent.setup();
    renderPage();
    await openUnavailabilityTab(user);

    await user.click(screen.getByRole("button", { name: "End now" }));
    const dialog = screen.getByRole("dialog", { name: "Return to service now?" });
    await user.click(within(dialog).getByRole("button", { name: "End now" }));

    await waitFor(() => expect(service.endEquipmentUnavailability).toHaveBeenCalledWith("record-current"));
    expect(await screen.findByText("Equipment returned to service.")).toBeInTheDocument();
  });

  it("filters records by status and strikes through cancelled ones", async () => {
    const user = userEvent.setup();
    renderPage();
    await openUnavailabilityTab(user);

    expect(screen.getByText("Entered by mistake").closest("div")).toHaveClass("line-through");
    expect(screen.getByText("Battery fault").closest("div")).not.toHaveClass("line-through");

    await user.click(screen.getByRole("button", { name: "Removed 1" }));
    expect(screen.getByText("Entered by mistake")).toBeInTheDocument();
    expect(screen.queryByText("Battery fault")).not.toBeInTheDocument();
  });

  it("offers no actions on a removed record", async () => {
    service.listEquipmentUnavailability.mockResolvedValue([removed]);
    const user = userEvent.setup();
    renderPage();
    await openUnavailabilityTab(user);

    expect(screen.getByText(/Entered by mistake/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "End now" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });
});

describe("EquipmentPage for other roles", () => {
  it("keeps the existing view for a coordinator", () => {
    authState.profile = { full_name: "Cory Coordinator", role: "event_coordinator" };
    renderPage();

    expect(screen.getByText("No equipment yet")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Inventory" })).not.toBeInTheDocument();
    expect(service.listInventory).not.toHaveBeenCalled();
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
