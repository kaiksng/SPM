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

const DAY = 24 * 60 * 60 * 1000;
const isoFromNow = (days: number) => new Date(Date.now() + days * DAY).toISOString();

async function fillAndSave(user: ReturnType<typeof userEvent.setup>, overrides: { start?: string; end?: string } = {}) {
  await screen.findByText("Boiler servicing");
  await user.selectOptions(screen.getByLabelText("Reason category"), "maintenance");
  await user.type(screen.getByLabelText("Reason"), "Air-conditioning repair");
  fireEvent.change(screen.getByLabelText("Start date and time"), { target: { value: overrides.start ?? "2099-04-06T12:00" } });
  fireEvent.change(screen.getByLabelText("End date and time"), { target: { value: overrides.end ?? "2099-04-06T14:00" } });
  await user.click(screen.getByRole("button", { name: "Save block" }));
}

// SPM-19 AC: Venue Staff can create a block with venue, reason, start time and end time (SPM-83 AC01 adds the category).
describe("VenueBlocksPage creating a block", () => {
  it("shows the venue and its history link before any block is entered", async () => {
    renderPage();

    expect(await screen.findByText(/Auditorium · Maintenance, renovation and safety closures/)).toBeInTheDocument();
    expect(screen.getByLabelText("Venue")).toHaveValue("Auditorium");
    expect(screen.getByRole("link", { name: /View availability/ })).toHaveAttribute("href", `/venues/${venueId}/availability`);
    expect(screen.getByRole("link", { name: /Back to venue/ })).toHaveAttribute("href", `/venues/${venueId}`);
  });

  // SPM-19 AC: an end time earlier than or equal to the start time is rejected with a validation message (SPM-83 AC04).
  it("rejects an end time that is not after the start and does not save", async () => {
    const user = userEvent.setup();
    renderPage();

    await fillAndSave(user, { start: "2099-04-06T12:00", end: "2099-04-06T12:00" });

    expect(await screen.findByText("End time must be after start time")).toBeInTheDocument();
    expect(screen.getByLabelText("End date and time")).toHaveAttribute("aria-invalid", "true");
    expect(previewVenueBlockImpactMock).not.toHaveBeenCalled();
  });

  // SPM-19 AC: missing start and end times identify the affected fields.
  it("asks for a start and an end time", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Boiler servicing");

    await user.click(screen.getByRole("button", { name: "Save block" }));

    expect(screen.getAllByText("Enter a date and time")).toHaveLength(2);
    expect(screen.getByLabelText("Start date and time")).toHaveAttribute("aria-invalid", "true");
  });

  it("clears the form after the block is saved", async () => {
    const user = userEvent.setup();
    renderPage();

    await fillAndSave(user);

    expect(await screen.findByText("Block saved. Availability has been updated.")).toBeInTheDocument();
    expect(screen.getByLabelText("Reason")).toHaveValue("");
    expect(screen.getByLabelText("Reason category")).toHaveValue("");
    expect(screen.getByLabelText("Start date and time")).toHaveValue("");
  });

  it("explains a failed save without a message, and a failed impact check", async () => {
    const user = userEvent.setup();
    createVenueBlockMock.mockRejectedValueOnce("boom");
    renderPage();
    await fillAndSave(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("This block could not be saved.");

    previewVenueBlockImpactMock.mockRejectedValueOnce(new Error("Impact check unavailable"));
    await user.click(screen.getByRole("button", { name: "Save block" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Impact check unavailable");
  });
});

// SPM-19 AC: current and past blocks remain visible in the venue's block history.
describe("VenueBlocksPage block history", () => {
  it("shows every block with its category and whether it is past, in progress, upcoming or removed", async () => {
    listVenueBlocksMock.mockResolvedValue([
      { ...block, id: "b-past", reason: "Old repair", startsAt: isoFromNow(-9), endsAt: isoFromNow(-8) },
      { ...block, id: "b-now", reason: "Repair in progress", reasonCategory: "renovation", startsAt: isoFromNow(-1), endsAt: isoFromNow(1) },
      { ...block, id: "b-next", reason: "Planned inspection", reasonCategory: "safety", startsAt: isoFromNow(5), endsAt: isoFromNow(6) },
      { ...block, id: "b-gone", reason: "Cancelled closure", reasonCategory: "other", startsAt: isoFromNow(8), endsAt: isoFromNow(9), removedAt: isoFromNow(-2) },
    ]);
    renderPage();

    const row = async (reason: string) => (await screen.findByText(reason)).closest("li") as HTMLElement;
    expect(within(await row("Old repair")).getByText("Past")).toBeInTheDocument();
    expect(within(await row("Repair in progress")).getByText("In progress")).toBeInTheDocument();
    expect(within(await row("Repair in progress")).getByText("Renovation")).toBeInTheDocument();
    expect(within(await row("Planned inspection")).getByText("Upcoming")).toBeInTheDocument();
    expect(within(await row("Planned inspection")).getByText("Safety")).toBeInTheDocument();
    const removed = await row("Cancelled closure");
    expect(within(removed).getByText("Removed", { selector: "span" })).toBeInTheDocument();
    expect(within(removed).getByText(/^Removed /)).toBeInTheDocument();
  });

  // SPM-19 AC: a block can be removed only while it still applies.
  it("offers shorten and remove only for a block that has not ended or been removed", async () => {
    listVenueBlocksMock.mockResolvedValue([
      { ...block, id: "b-past", reason: "Old repair", startsAt: isoFromNow(-9), endsAt: isoFromNow(-8) },
      { ...block, id: "b-gone", reason: "Cancelled closure", startsAt: isoFromNow(8), endsAt: isoFromNow(9), removedAt: isoFromNow(-2) },
      { ...block, id: "b-next", reason: "Planned inspection", startsAt: isoFromNow(5), endsAt: isoFromNow(6) },
    ]);
    renderPage();
    await screen.findByText("Planned inspection");

    expect(screen.getAllByRole("button", { name: "Remove block" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Shorten block" })).toHaveLength(1);
  });

  it("says when no block has been recorded, and when a block has no reason", async () => {
    listVenueBlocksMock.mockResolvedValue([]);
    const empty = renderPage();
    expect(await screen.findByText("No blocks have been recorded for this venue.")).toBeInTheDocument();
    empty.unmount();

    listVenueBlocksMock.mockResolvedValue([{ ...block, reason: "" }]);
    renderPage();
    expect(await screen.findByText("Reason not recorded")).toBeInTheDocument();
  });
});

// Loading the page: who may open it, and what is shown while or if it cannot load.
describe("VenueBlocksPage loading", () => {
  it("shows that the history is loading, then the page", async () => {
    let finish: (rows: unknown[]) => void = () => {};
    listVenueBlocksMock.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderPage();

    expect(screen.getByText("Loading block history…")).toBeInTheDocument();
    finish([block]);
    expect(await screen.findByText("Boiler servicing")).toBeInTheDocument();
  });

  it("says why the venue could not be loaded, or that it was not found", async () => {
    getVenueMock.mockRejectedValueOnce(new Error("Venue lookup failed"));
    const failed = renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Venue lookup failed");
    failed.unmount();

    getVenueMock.mockRejectedValueOnce("boom");
    const unknown = renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load blocks.");
    unknown.unmount();

    getVenueMock.mockResolvedValueOnce({ name: "" });
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Venue not found.");
  });

  it("denies a signed-out user and loads nothing", () => {
    (authState as { profile: unknown }).profile = undefined;
    renderPage();

    expect(getVenueMock).not.toHaveBeenCalled();
    authState.profile = { role: "venue_staff" };
  });

  it("loads nothing when the page address has no venue", () => {
    render(<MemoryRouter initialEntries={["/venues"]}><Routes>
      <Route path="venues" element={<VenueBlocksPage />} />
    </Routes></MemoryRouter>);

    expect(getVenueMock).not.toHaveBeenCalled();
    expect(screen.getByText("Loading block history…")).toBeInTheDocument();
  });

  it("ignores a response that arrives after the staff member has left the page", async () => {
    let resolveBlocks: (rows: unknown[]) => void = () => {};
    listVenueBlocksMock.mockReturnValueOnce(new Promise((resolve) => { resolveBlocks = resolve; }));
    const first = renderPage();
    first.unmount();
    resolveBlocks([block]);

    let rejectBlocks: (reason: unknown) => void = () => {};
    listVenueBlocksMock.mockReturnValueOnce(new Promise((_, reject) => { rejectBlocks = reject; }));
    const second = renderPage();
    second.unmount();
    rejectBlocks(new Error("too late"));

    await waitFor(() => expect(listVenueBlocksMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Boiler servicing")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

// SPM-83 AC06/AC09: a block may overlap bookings; staff see who is affected and confirm before it is saved.
describe("VenueBlocksPage affected bookings", () => {
  const booking = (id: string, title: string, coordinatorName: string | null) => ({
    bookingId: id, eventId: `event-${id}`, eventTitle: title, coordinatorId: coordinatorName ? "coord-1" : null,
    coordinatorName, status: "approved", startsAt: "2099-04-06T02:00:00Z", endsAt: "2099-04-06T04:00:00Z",
  });

  it("reports several flagged bookings in the plural and an unassigned coordinator as Unassigned", async () => {
    const user = userEvent.setup();
    const affected = [booking("1", "Career Fair", "Priya Coordinator"), booking("2", "Open Day", null)];
    previewVenueBlockImpactMock.mockResolvedValue(affected);
    createVenueBlockMock.mockResolvedValue({ blockId: "block-2", affected });
    renderPage();
    await fillAndSave(user);

    const dialog = await screen.findByRole("dialog", { name: "This block affects existing bookings" });
    expect(within(dialog).getByText("Coordinator: Unassigned")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Save block anyway" }));

    expect(await screen.findByText(/2 bookings were flagged Disrupted - Alternative Required/)).toBeInTheDocument();
    expect(screen.getByText(/Open Day · Unassigned/)).toBeInTheDocument();
  });

  it("shows why the block could not be saved after confirming, and closes the confirmation", async () => {
    const user = userEvent.setup();
    previewVenueBlockImpactMock.mockResolvedValue([booking("1", "Career Fair", "Priya Coordinator")]);
    createVenueBlockMock.mockRejectedValueOnce(new Error("Venue not found"));
    renderPage();
    await fillAndSave(user);

    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Save block anyway" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Venue not found");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("uses a plain message when the confirmed save fails without one", async () => {
    const user = userEvent.setup();
    previewVenueBlockImpactMock.mockResolvedValue([booking("1", "Career Fair", "Priya Coordinator")]);
    createVenueBlockMock.mockRejectedValueOnce("boom");
    renderPage();
    await fillAndSave(user);

    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Save block anyway" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This block could not be saved.");
  });

  // SPM-83 AC04: a block can be shortened; bookings that no longer overlap are cleared.
  it("reports one booking no longer disrupted in the singular, and none when nothing was cleared", async () => {
    const user = userEvent.setup();
    shortenVenueBlockMock.mockResolvedValueOnce({ clearedCount: 1 });
    renderPage();
    const shorten = async () => {
      await user.click(await screen.findByRole("button", { name: "Shorten block" }));
      const dialog = screen.getByRole("dialog", { name: "Shorten this block" });
      fireEvent.change(within(dialog).getByLabelText("New end date and time"), { target: { value: "2099-04-06T11:00" } });
      await user.click(within(dialog).getByRole("button", { name: "Save shortened block" }));
    };

    await shorten();
    expect(await screen.findByText(/1 booking is no longer disrupted/)).toBeInTheDocument();

    await shorten();
    expect(await screen.findByText("Block shortened. Availability has been updated.")).toBeInTheDocument();
  });

  it("keeps the shorten dialog open with a plain message when shortening fails without one", async () => {
    const user = userEvent.setup();
    shortenVenueBlockMock.mockRejectedValueOnce("boom");
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Shorten block" }));
    const dialog = screen.getByRole("dialog", { name: "Shorten this block" });

    fireEvent.change(within(dialog).getByLabelText("New end date and time"), { target: { value: "2099-04-06T11:00" } });
    await user.click(within(dialog).getByRole("button", { name: "Save shortened block" }));

    expect(await within(dialog).findByText("This block could not be shortened.")).toBeInTheDocument();
  });

  it("closes the shorten dialog without changing the block when cancelled", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Shorten block" }));

    await user.click(within(screen.getByRole("dialog", { name: "Shorten this block" })).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(shortenVenueBlockMock).not.toHaveBeenCalled();
  });
});

describe("VenueBlocksPage removing a block", () => {
  async function openRemoveDialog(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole("button", { name: "Remove block" }));
    return screen.getByRole("alertdialog", { name: "Remove this block?" });
  }

  it("shows why the block could not be removed and keeps the dialog open", async () => {
    const user = userEvent.setup();
    removeVenueBlockMock.mockRejectedValueOnce(new Error("This block has already ended"));
    renderPage();
    const dialog = await openRemoveDialog(user);

    await user.click(within(dialog).getByRole("button", { name: "Remove block" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("This block has already ended");
  });

  it("uses a plain message when removal fails without one", async () => {
    const user = userEvent.setup();
    removeVenueBlockMock.mockRejectedValueOnce("boom");
    renderPage();
    const dialog = await openRemoveDialog(user);

    await user.click(within(dialog).getByRole("button", { name: "Remove block" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("This block could not be removed.");
  });

  it("says the block was removed even if the history cannot be refreshed", async () => {
    const user = userEvent.setup();
    listVenueBlocksMock.mockResolvedValueOnce([block]).mockRejectedValueOnce(new Error("offline"));
    renderPage();
    const dialog = await openRemoveDialog(user);

    await user.click(within(dialog).getByRole("button", { name: "Remove block" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The block was removed, but its history could not be refreshed. Reload this page.");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("closes with Escape, and keeps focus inside the dialog while it is open", async () => {
    const user = userEvent.setup();
    renderPage();
    const dialog = await openRemoveDialog(user);
    const keep = within(dialog).getByRole("button", { name: "Keep block" });
    const remove = within(dialog).getByRole("button", { name: "Remove block" });
    expect(keep).toHaveFocus();

    await user.tab({ shift: true });
    expect(remove).toHaveFocus();
    await user.tab();
    expect(keep).toHaveFocus();
    await user.tab();
    expect(remove).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(removeVenueBlockMock).not.toHaveBeenCalled();
  });

  it("ignores Escape and Tab handling while the removal is in progress", async () => {
    const user = userEvent.setup();
    let finish: () => void = () => {};
    removeVenueBlockMock.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    renderPage();
    const dialog = await openRemoveDialog(user);

    await user.click(within(dialog).getByRole("button", { name: "Remove block" }));
    expect(await within(dialog).findByRole("button", { name: "Removing…" })).toBeDisabled();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    finish();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });
});

describe("VenueBlocksPage dialogs for a block", () => {
  it("names a block with no recorded reason in the removal confirmation", async () => {
    const user = userEvent.setup();
    listVenueBlocksMock.mockResolvedValue([{ ...block, reason: "" }]);
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Remove block" }));

    expect(within(screen.getByRole("alertdialog")).getByText("Reason not recorded")).toBeInTheDocument();
  });

  it("shows that shortening is being saved", async () => {
    const user = userEvent.setup();
    let finish: (result: { clearedCount: number }) => void = () => {};
    shortenVenueBlockMock.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Shorten block" }));
    const dialog = screen.getByRole("dialog", { name: "Shorten this block" });

    fireEvent.change(within(dialog).getByLabelText("New end date and time"), { target: { value: "2099-04-06T11:00" } });
    await user.click(within(dialog).getByRole("button", { name: "Save shortened block" }));

    expect(await within(dialog).findByRole("button", { name: "Saving…" })).toBeDisabled();
    finish({ clearedCount: 0 });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

