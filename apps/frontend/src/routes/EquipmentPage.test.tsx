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

const listStockedEquipmentMock = vi.fn();
const listEquipmentUnavailabilityMock = vi.fn();
const listOverlappingReservationsMock = vi.fn();
const recordEquipmentUnavailabilityMock = vi.fn();
const endEquipmentUnavailabilityMock = vi.fn();
const removeEquipmentUnavailabilityMock = vi.fn();
const updateEquipmentStockMock = vi.fn();

vi.mock("@/features/equipment/services/equipment-unavailability", () => ({
  listStockedEquipment: () => listStockedEquipmentMock(),
  listEquipmentUnavailability: () => listEquipmentUnavailabilityMock(),
  listOverlappingReservations: (...args: unknown[]) => listOverlappingReservationsMock(...args),
  recordEquipmentUnavailability: (...args: unknown[]) => recordEquipmentUnavailabilityMock(...args),
  endEquipmentUnavailability: (...args: unknown[]) => endEquipmentUnavailabilityMock(...args),
  removeEquipmentUnavailability: (...args: unknown[]) => removeEquipmentUnavailabilityMock(...args),
  updateEquipmentStock: (...args: unknown[]) => updateEquipmentStockMock(...args),
}));

import { EquipmentPage } from "./EquipmentPage";

const PROJECTOR = "a0000000-0000-0000-0000-000000000002";
const hours = (offset: number) => new Date(Date.now() + offset * 3_600_000).toISOString();

const inProgress = {
  id: "record-current",
  equipmentItemId: PROJECTOR,
  equipmentName: "Projector",
  quantity: 2,
  reason: "Sent for repair",
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

beforeEach(() => {
  authState.profile = { full_name: "Tess Support", role: "technical_support_staff" };
  listStockedEquipmentMock.mockReset().mockResolvedValue([
    { id: "a0000000-0000-0000-0000-000000000001", name: "Wireless microphone", category: "Audio", totalQuantity: 10 },
    { id: PROJECTOR, name: "Projector", category: "Visual", totalQuantity: 6 },
  ]);
  listEquipmentUnavailabilityMock.mockReset().mockResolvedValue([inProgress, removed]);
  listOverlappingReservationsMock.mockReset().mockResolvedValue([]);
  recordEquipmentUnavailabilityMock.mockReset().mockResolvedValue(undefined);
  endEquipmentUnavailabilityMock.mockReset().mockResolvedValue(undefined);
  removeEquipmentUnavailabilityMock.mockReset().mockResolvedValue(undefined);
  updateEquipmentStockMock.mockReset().mockResolvedValue(undefined);
});

describe("EquipmentPage for Technical Support Staff (SPM-30)", () => {
  it("shows stock, with units currently out of service", async () => {
    renderPage();

    expect(await screen.findByLabelText("Total stock for Projector")).toHaveValue(6);
    expect(screen.getByText("2 out of service")).toBeInTheDocument();
  });

  it("saves an edited stock total", async () => {
    const user = userEvent.setup();
    renderPage();

    const input = await screen.findByLabelText("Total stock for Projector");
    await user.clear(input);
    await user.type(input, "8");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateEquipmentStockMock).toHaveBeenCalledWith(PROJECTOR, 8));
  });

  it("identifies each missing field and does not save (AC01)", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.clear(await screen.findByLabelText("Quantity unavailable"));
    await user.click(screen.getByRole("button", { name: /Record unavailability/ }));

    expect(await screen.findByText("Choose equipment from the catalogue")).toBeInTheDocument();
    expect(screen.getByText("Enter a quantity")).toBeInTheDocument();
    expect(screen.getByText("Enter a reason")).toBeInTheDocument();
    expect(screen.getAllByText("Enter a date and time")).toHaveLength(2);
    expect(recordEquipmentUnavailabilityMock).not.toHaveBeenCalled();
  });

  it("requires the end to be after the start (AC02)", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(await screen.findByLabelText("Equipment"), PROJECTOR);
    await user.type(screen.getByLabelText("Unavailable from"), "2099-04-10T12:00");
    await user.type(screen.getByLabelText("Unavailable until"), "2099-04-10T09:00");
    await user.type(screen.getByLabelText("Reason"), "Repair");
    await user.click(screen.getByRole("button", { name: /Record unavailability/ }));

    expect(await screen.findByText("End time must be after start time")).toBeInTheDocument();
    expect(recordEquipmentUnavailabilityMock).not.toHaveBeenCalled();
  });

  it("shows overlapping records and reservations before saving (AC03)", async () => {
    listOverlappingReservationsMock.mockResolvedValue([
      {
        id: "reservation-1",
        quantity: 3,
        status: "approved",
        startsAt: hours(1),
        endsAt: hours(5),
        eventTitle: "Orientation Day",
      },
    ]);
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(await screen.findByLabelText("Equipment"), PROJECTOR);
    await user.type(screen.getByLabelText("Unavailable from"), toLocal(hours(1)));
    await user.type(screen.getByLabelText("Unavailable until"), toLocal(hours(6)));

    const panel = await screen.findByRole("region", { name: "Overlaps for this period" });
    expect(within(panel).getByText(/Projector: 6 in stock/)).toBeInTheDocument();
    expect(within(panel).getByText(/Unavailable × 2/)).toBeInTheDocument();
    expect(within(panel).queryByText(/Entered by mistake/)).not.toBeInTheDocument();
    expect(await within(panel).findByText(/Confirmed reservation × 3/)).toBeInTheDocument();
    expect(within(panel).getByText(/Orientation Day/)).toBeInTheDocument();
    expect(recordEquipmentUnavailabilityMock).not.toHaveBeenCalled();
  });

  it("records a complete entry", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(await screen.findByLabelText("Equipment"), PROJECTOR);
    await user.clear(screen.getByLabelText("Quantity unavailable"));
    await user.type(screen.getByLabelText("Quantity unavailable"), "1");
    await user.type(screen.getByLabelText("Unavailable from"), "2099-04-10T09:00");
    await user.type(screen.getByLabelText("Unavailable until"), "2099-04-12T09:00");
    await user.type(screen.getByLabelText("Reason"), "Lamp replacement");
    await user.click(screen.getByRole("button", { name: /Record unavailability/ }));

    await waitFor(() =>
      expect(recordEquipmentUnavailabilityMock).toHaveBeenCalledWith({
        equipmentItemId: PROJECTOR,
        quantity: "1",
        reason: "Lamp replacement",
        startsAt: "2099-04-10T09:00",
        endsAt: "2099-04-12T09:00",
      }),
    );
    expect(await screen.findByText("Unavailability recorded.")).toBeInTheDocument();
  });

  it("accepts a quantity typed with a leading zero", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(await screen.findByLabelText("Equipment"), PROJECTOR);
    await user.clear(screen.getByLabelText("Quantity unavailable"));
    await user.type(screen.getByLabelText("Quantity unavailable"), "01");
    await user.type(screen.getByLabelText("Unavailable from"), "2099-04-10T09:00");
    await user.type(screen.getByLabelText("Unavailable until"), "2099-04-12T09:00");
    await user.type(screen.getByLabelText("Reason"), "Repair");
    await user.click(screen.getByRole("button", { name: /Record unavailability/ }));

    // jsdom's number input strips the zero itself (Chrome keeps "01"); the
    // "01"/"04" rule is covered directly in the shared schema tests.
    await waitFor(() => expect(recordEquipmentUnavailabilityMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Enter a positive whole number")).not.toBeInTheDocument();
  });

  it("keeps who recorded and removed each record (AC06)", async () => {
    renderPage();

    expect(await screen.findAllByText(/Recorded .* by Sam Support/)).toHaveLength(2);
    expect(screen.getByText(/Removed .* by Tess Support/)).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getAllByText("Removed")[0]).toBeInTheDocument();
  });

  it("ends an in-progress record after confirmation (AC05)", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "End now" }));
    const dialog = screen.getByRole("dialog", { name: "Return to service now?" });
    await user.click(within(dialog).getByRole("button", { name: "End now" }));

    await waitFor(() => expect(endEquipmentUnavailabilityMock).toHaveBeenCalledWith("record-current"));
    expect(await screen.findByText("Equipment returned to service.")).toBeInTheDocument();
  });

  it("offers no actions on a removed record", async () => {
    listEquipmentUnavailabilityMock.mockResolvedValue([removed]);
    renderPage();

    expect(await screen.findByText(/Entered by mistake/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "End now" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });
});

describe("EquipmentPage for other roles", () => {
  it("keeps the existing view for a coordinator", async () => {
    authState.profile = { full_name: "Cory Coordinator", role: "event_coordinator" };
    renderPage();

    expect(screen.getByText("No equipment yet")).toBeInTheDocument();
    expect(screen.queryByText("Record equipment as unavailable")).not.toBeInTheDocument();
    expect(listStockedEquipmentMock).not.toHaveBeenCalled();
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
