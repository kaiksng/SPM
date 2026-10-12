import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getVenueMock = vi.fn();
const listVenueBlocksMock = vi.fn();
const createVenueBlockMock = vi.fn();
const previewVenueBlockImpactMock = vi.fn();
const shortenVenueBlockMock = vi.fn();
const removeVenueBlockMock = vi.fn();
const authState = { profile: { role: "venue_staff" } };
const venueId = "f3000000-0000-4000-8000-000000000010";

vi.mock("@/context/auth-context", () => ({ useAuth: () => authState }));
vi.mock("@/features/venues/services/venues", () => ({ getVenue: (...args: unknown[]) => getVenueMock(...args) }));
vi.mock("@/features/venues/services/venue-blocks", () => ({
  listVenueBlocks: (...args: unknown[]) => listVenueBlocksMock(...args),
  createVenueBlock: (...args: unknown[]) => createVenueBlockMock(...args),
  previewVenueBlockImpact: (...args: unknown[]) => previewVenueBlockImpactMock(...args),
  shortenVenueBlock: (...args: unknown[]) => shortenVenueBlockMock(...args),
  removeVenueBlock: (...args: unknown[]) => removeVenueBlockMock(...args),
}));
vi.mock("@/hooks/use-page-title", () => ({ usePageTitle: vi.fn() }));

import { VenueBlocksPage } from "./VenueBlocksPage";

const block = {
  id: "block-1", venueId, reasonCategory: "maintenance", reason: "Boiler servicing",
  startsAt: "2099-04-06T02:00:00Z", endsAt: "2099-04-06T04:00:00Z",
  removedAt: null, removedBy: null,
};

function renderPage() {
  return render(<MemoryRouter initialEntries={[`/venues/${venueId}/blocks`]}><Routes>
    <Route path="venues/:venueId/blocks" element={<VenueBlocksPage />} />
  </Routes></MemoryRouter>);
}

beforeEach(() => {
  authState.profile.role = "venue_staff";
  getVenueMock.mockReset().mockResolvedValue({ name: "Auditorium" });
  listVenueBlocksMock.mockReset().mockResolvedValue([block]);
  createVenueBlockMock.mockReset().mockResolvedValue({ blockId: "block-2", affected: [] });
  previewVenueBlockImpactMock.mockReset().mockResolvedValue([]);
  shortenVenueBlockMock.mockReset().mockResolvedValue({ clearedCount: 0 });
  removeVenueBlockMock.mockReset().mockResolvedValue(undefined);
});

describe("VenueBlocksPage", () => {
  it("identifies missing fields before saving", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Boiler servicing");
    await user.click(screen.getByRole("button", { name: "Save block" }));
    expect(screen.getByText("Enter a reason")).toBeInTheDocument();
    // SPM-83 AC01: a reason category is required.
    expect(screen.getByText("Select a reason category")).toBeInTheDocument();
    expect(previewVenueBlockImpactMock).not.toHaveBeenCalled();
    expect(createVenueBlockMock).not.toHaveBeenCalled();
  });

  it("explains when the venue in the page address is not valid", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/venues/not-a-venue/blocks"]}><Routes>
      <Route path="venues/:venueId/blocks" element={<VenueBlocksPage />} />
    </Routes></MemoryRouter>);
    await screen.findByText("Boiler servicing");
    await user.selectOptions(screen.getByLabelText("Reason category"), "maintenance");
    await user.type(screen.getByLabelText("Reason"), "Repair");
    fireEvent.change(screen.getByLabelText("Start date and time"), { target: { value: "2099-04-06T12:00" } });
    fireEvent.change(screen.getByLabelText("End date and time"), { target: { value: "2099-04-06T14:00" } });
    await user.click(screen.getByRole("button", { name: "Save block" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This venue link is not valid");
    expect(previewVenueBlockImpactMock).not.toHaveBeenCalled();
  });

  it("creates a block and refreshes history", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Boiler servicing");
    await user.selectOptions(screen.getByLabelText("Reason category"), "safety");
    await user.type(screen.getByLabelText("Reason"), "Safety inspection");
    fireEvent.change(screen.getByLabelText("Start date and time"), { target: { value: "2099-04-07T10:00" } });
    fireEvent.change(screen.getByLabelText("End date and time"), { target: { value: "2099-04-07T12:00" } });
    await user.click(screen.getByRole("button", { name: "Save block" }));
    await waitFor(() => expect(createVenueBlockMock).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "Safety inspection", reasonCategory: "safety" }),
    ));
    expect(await screen.findByText(/Block saved/)).toBeInTheDocument();
    // No overlapping bookings, so there is nothing to confirm.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  async function fillBlockForm(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByText("Boiler servicing");
    await user.selectOptions(screen.getByLabelText("Reason category"), "maintenance");
    await user.type(screen.getByLabelText("Reason"), "Air-conditioning repair");
    fireEvent.change(screen.getByLabelText("Start date and time"), { target: { value: "2099-04-06T12:00" } });
    fireEvent.change(screen.getByLabelText("End date and time"), { target: { value: "2099-04-06T14:00" } });
    await user.click(screen.getByRole("button", { name: "Save block" }));
  }

  const affected = [
    {
      bookingId: "booking-1", eventId: "event-1", eventTitle: "Career Fair",
      coordinatorId: "coord-1", coordinatorName: "Priya Coordinator", status: "approved",
      startsAt: "2099-04-06T02:00:00Z", endsAt: "2099-04-06T04:00:00Z",
    },
  ];

  // SPM-83 AC: Venue Staff are shown the affected bookings (event, coordinator,
  // period) and must confirm before an overlapping block is saved.
  it("shows the affected bookings and saves only after confirmation", async () => {
    const user = userEvent.setup();
    previewVenueBlockImpactMock.mockResolvedValue(affected);
    createVenueBlockMock.mockResolvedValue({ blockId: "block-2", affected });
    renderPage();
    await fillBlockForm(user);

    const dialog = await screen.findByRole("dialog", { name: "This block affects existing bookings" });
    expect(within(dialog).getByText("Career Fair")).toBeInTheDocument();
    expect(within(dialog).getByText("Coordinator: Priya Coordinator")).toBeInTheDocument();
    expect(within(dialog).getByText(/Nothing is cancelled/)).toBeInTheDocument();
    expect(createVenueBlockMock).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Save block anyway" }));
    await waitFor(() => expect(createVenueBlockMock).toHaveBeenCalledWith(
      expect.objectContaining({ reasonCategory: "maintenance", reason: "Air-conditioning repair" }),
    ));
    expect(await screen.findByText(/1 booking was flagged Disrupted - Alternative Required/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // The result sits with the form (not above it) and names who was affected.
    const result = screen.getByRole("status");
    expect(within(screen.getByRole("button", { name: "Save block" }).parentElement!).getByRole("status")).toBe(result);
    expect(within(result).getByText(/Career Fair · Priya Coordinator/)).toBeInTheDocument();
  });

  it("does not save the block when Venue Staff go back from the confirmation", async () => {
    const user = userEvent.setup();
    previewVenueBlockImpactMock.mockResolvedValue(affected);
    renderPage();
    await fillBlockForm(user);

    const dialog = await screen.findByRole("dialog", { name: "This block affects existing bookings" });
    await user.click(within(dialog).getByRole("button", { name: "Go back" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(createVenueBlockMock).not.toHaveBeenCalled();
  });

  it("shows why a block could not be saved", async () => {
    const user = userEvent.setup();
    createVenueBlockMock.mockRejectedValue(new Error("Venue not found"));
    renderPage();
    await fillBlockForm(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("Venue not found");
  });

  // SPM-83 AC: Venue Staff can shorten an unavailability period.
  it("shortens a block and reports the bookings that were cleared", async () => {
    const user = userEvent.setup();
    shortenVenueBlockMock.mockResolvedValue({ clearedCount: 2 });
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Shorten block" }));
    const dialog = screen.getByRole("dialog", { name: "Shorten this block" });
    fireEvent.change(within(dialog).getByLabelText("New start date and time"), { target: { value: "2099-04-06T11:00" } });
    fireEvent.change(within(dialog).getByLabelText("New end date and time"), { target: { value: "2099-04-06T11:30" } });
    await user.click(within(dialog).getByRole("button", { name: "Save shortened block" }));

    await waitFor(() => expect(shortenVenueBlockMock).toHaveBeenCalledWith("block-1", "2099-04-06T11:00", "2099-04-06T11:30"));
    expect(await screen.findByText(/2 bookings are no longer disrupted/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("requires the shortened end to be after the start and surfaces server errors", async () => {
    const user = userEvent.setup();
    shortenVenueBlockMock.mockRejectedValue(new Error("A block can only be shortened"));
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Shorten block" }));
    const dialog = screen.getByRole("dialog", { name: "Shorten this block" });

    fireEvent.change(within(dialog).getByLabelText("New end date and time"), { target: { value: "2099-04-06T09:00" } });
    await user.click(within(dialog).getByRole("button", { name: "Save shortened block" }));
    expect(await within(dialog).findByText("End time must be after start time")).toBeInTheDocument();
    expect(shortenVenueBlockMock).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText("New end date and time"), { target: { value: "2099-04-06T13:00" } });
    await user.click(within(dialog).getByRole("button", { name: "Save shortened block" }));
    expect(await within(dialog).findByText("A block can only be shortened")).toBeInTheDocument();
  });

  it("confirms removal and keeps history visible", async () => {
    const user = userEvent.setup();
    listVenueBlocksMock.mockResolvedValueOnce([block]).mockResolvedValueOnce([{ ...block, removedAt: "2099-04-06T00:00:00Z" }]);
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Remove block" }));
    const dialog = screen.getByRole("alertdialog", { name: "Remove this block?" });
    expect(within(dialog).getByText(/remains in block history/)).toBeInTheDocument();
    expect(removeVenueBlockMock).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Remove block" }));
    await waitFor(() => expect(removeVenueBlockMock).toHaveBeenCalledWith("block-1"));
    expect(await screen.findByText("Removed", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Boiler servicing")).toBeInTheDocument();
  });

  it("keeps the block when the in-app dialog is cancelled", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Remove block" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Keep block" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(removeVenueBlockMock).not.toHaveBeenCalled();
  });

  it("does not expose block controls to other roles", async () => {
    authState.profile.role = "event_coordinator";
    renderPage();
    expect(await screen.findByText("Venue Staff access is required.")).toBeInTheDocument();
    expect(createVenueBlockMock).not.toHaveBeenCalled();
  });
});
