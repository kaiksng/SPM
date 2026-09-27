import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getVenueMock = vi.fn();
const listVenueBlocksMock = vi.fn();
const createVenueBlockMock = vi.fn();
const removeVenueBlockMock = vi.fn();
const authState = { profile: { role: "venue_staff" } };
const venueId = "f3000000-0000-4000-8000-000000000010";

vi.mock("@/context/auth-context", () => ({ useAuth: () => authState }));
vi.mock("@/features/venues/services/venues", () => ({ getVenue: (...args: unknown[]) => getVenueMock(...args) }));
vi.mock("@/features/venues/services/venue-blocks", () => ({
  listVenueBlocks: (...args: unknown[]) => listVenueBlocksMock(...args),
  createVenueBlock: (...args: unknown[]) => createVenueBlockMock(...args),
  removeVenueBlock: (...args: unknown[]) => removeVenueBlockMock(...args),
}));
vi.mock("@/hooks/use-page-title", () => ({ usePageTitle: vi.fn() }));

import { VenueBlocksPage } from "./VenueBlocksPage";

const block = {
  id: "block-1", venueId, reason: "Maintenance",
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
  createVenueBlockMock.mockReset().mockResolvedValue(undefined);
  removeVenueBlockMock.mockReset().mockResolvedValue(undefined);
});

describe("VenueBlocksPage", () => {
  it("identifies missing fields before saving", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Maintenance");
    await user.click(screen.getByRole("button", { name: "Save block" }));
    expect(screen.getByText("Enter a reason")).toBeInTheDocument();
    expect(createVenueBlockMock).not.toHaveBeenCalled();
  });

  it("creates a block and refreshes history", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Maintenance");
    await user.type(screen.getByLabelText("Reason"), "Safety inspection");
    fireEvent.change(screen.getByLabelText("Start date and time"), { target: { value: "2099-04-07T10:00" } });
    fireEvent.change(screen.getByLabelText("End date and time"), { target: { value: "2099-04-07T12:00" } });
    await user.click(screen.getByRole("button", { name: "Save block" }));
    await waitFor(() => expect(createVenueBlockMock).toHaveBeenCalledWith(expect.objectContaining({ reason: "Safety inspection" })));
    expect(await screen.findByText(/Block saved/)).toBeInTheDocument();
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
    expect(screen.getByText("Maintenance")).toBeInTheDocument();
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
